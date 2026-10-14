import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Apply auth middleware to all job routes
router.use(authenticateToken);

// 6. GET /api/jobs/calendar — Jobs grouped by date for calendar view (tenant-scoped)
// MUST PLACE THIS ABOVE /:id ROUTE TO PREVENT CONFLICTS!
router.get('/calendar', async (req: Request, res: Response) => {
  const orgId = req.user!.orgId;
  const { start, end } = req.query;

  try {
    const whereClause: any = { orgId };

    if (start && end) {
      whereClause.scheduledStart = {
        gte: new Date(String(start)),
        lte: new Date(String(end)),
      };
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        property: {
          include: {
            customer: true,
          },
        },
        assignedTech: true,
      },
      orderBy: {
        scheduledStart: 'asc',
      },
    });

    // Group by date (YYYY-MM-DD)
    const groupedJobs: { [date: string]: typeof jobs } = {};

    jobs.forEach(job => {
      const dateStr = job.scheduledStart.toISOString().split('T')[0];
      if (!groupedJobs[dateStr]) {
        groupedJobs[dateStr] = [];
      }
      groupedJobs[dateStr].push(job);
    });

    return res.json(groupedJobs);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 1. GET /api/jobs — List jobs with filters: date range, status, assigned tech (tenant-scoped)
router.get('/', async (req: Request, res: Response) => {
  const orgId = req.user!.orgId;
  const { startDate, endDate, status, assignedTechId } = req.query;

  try {
    const whereClause: any = { orgId };

    if (startDate && endDate) {
      whereClause.scheduledStart = {
        gte: new Date(String(startDate)),
        lte: new Date(String(endDate)),
      };
    } else if (startDate) {
      whereClause.scheduledStart = {
        gte: new Date(String(startDate)),
      };
    } else if (endDate) {
      whereClause.scheduledStart = {
        lte: new Date(String(endDate)),
      };
    }

    if (status) {
      whereClause.status = String(status);
    }

    if (assignedTechId) {
      whereClause.assignedTechId = String(assignedTechId);
    }

    const jobs = await prisma.job.findMany({
      where: whereClause,
      include: {
        property: {
          include: {
            customer: true,
          },
        },
        assignedTech: true,
      },
      orderBy: {
        scheduledStart: 'asc',
      },
    });

    return res.json(jobs);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 2. POST /api/jobs — Create job (tenant-scoped)
router.post('/', async (req: Request, res: Response) => {
  const orgId = req.user!.orgId;
  const { propertyId, assignedTechId, jobType, scheduledStart, scheduledEnd, status, notes, routeSequence } = req.body;

  if (!propertyId || !jobType || !scheduledStart || !scheduledEnd) {
    return res.status(400).json({ error: 'Property ID, job type, scheduled start, and scheduled end are required.' });
  }

  try {
    // Verify property belongs to organization
    const property = await prisma.property.findFirst({
      where: { id: propertyId, orgId },
    });

    if (!property) {
      return res.status(400).json({ error: 'Invalid property ID.' });
    }

    // Verify technician if provided
    if (assignedTechId) {
      const tech = await prisma.user.findFirst({
        where: { id: assignedTechId, orgId },
      });
      if (!tech) {
        return res.status(400).json({ error: 'Invalid technician ID.' });
      }
    }

    const job = await prisma.job.create({
      data: {
        orgId,
        propertyId,
        assignedTechId: assignedTechId || null,
        jobType,
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        status: status || 'scheduled',
        notes,
        routeSequence: routeSequence ? parseInt(routeSequence) : null,
      },
    });

    return res.status(201).json(job);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 3. GET /api/jobs/:id — Get job details with timestamps (tenant-scoped)
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.user!.orgId;

  try {
    const job = await prisma.job.findFirst({
      where: { id, orgId },
      include: {
        property: {
          include: {
            customer: true,
          },
        },
        assignedTech: true,
        partsUsed: {
          include: {
            part: true,
            warehouse: true,
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    return res.json(job);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 4. PUT /api/jobs/:id — Update job (tenant-scoped)
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.user!.orgId;
  const { propertyId, assignedTechId, jobType, scheduledStart, scheduledEnd, status, notes, routeSequence } = req.body;

  try {
    const jobExists = await prisma.job.findFirst({
      where: { id, orgId },
    });

    if (!jobExists) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    // Verify property if provided
    if (propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: propertyId, orgId },
      });
      if (!property) {
        return res.status(400).json({ error: 'Invalid property ID.' });
      }
    }

    // Verify technician if provided
    if (assignedTechId) {
      const tech = await prisma.user.findFirst({
        where: { id: assignedTechId, orgId },
      });
      if (!tech) {
        return res.status(400).json({ error: 'Invalid technician ID.' });
      }
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        propertyId: propertyId || undefined,
        assignedTechId: assignedTechId !== undefined ? assignedTechId : undefined,
        jobType: jobType || undefined,
        scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
        scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : undefined,
        status: status || undefined,
        notes: notes !== undefined ? notes : undefined,
        routeSequence: routeSequence !== undefined ? (routeSequence ? parseInt(routeSequence) : null) : undefined,
      },
    });

    return res.json(updatedJob);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 5. PATCH /api/jobs/:id/status — Update job status with automatic timestamps (tenant-scoped)
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const orgId = req.user!.orgId;

  const validStatuses = ['scheduled', 'en_route', 'in_progress', 'completed', 'cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const job = await prisma.job.findFirst({
      where: { id, orgId },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const updateData: any = { status };

    // Record automatic timestamps
    if (status === 'in_progress' && !job.actualStart) {
      updateData.actualStart = new Date();
    } else if (status === 'completed' && !job.actualEnd) {
      updateData.actualEnd = new Date();
      if (!job.actualStart) {
        updateData.actualStart = job.scheduledStart; // Fallback start if completed directly
      }
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: updateData,
    });

    return res.json(updatedJob);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
