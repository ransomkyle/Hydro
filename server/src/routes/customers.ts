import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// Apply auth middleware to all customer and property routes
router.use(authenticateToken);

// 1. GET /api/customers — List customers with search/filter (tenant-scoped)
router.get('/', async (req: Request, res: Response) => {
  const { search } = req.query;
  const orgId = req.user!.orgId;

  try {
    const whereClause: any = { orgId };

    if (search) {
      const searchStr = String(search);
      whereClause.OR = [
        { firstName: { contains: searchStr } },
        { lastName: { contains: searchStr } },
        { email: { contains: searchStr } },
        { phone: { contains: searchStr } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        properties: true,
      },
      orderBy: {
        lastName: 'asc',
      },
    });

    return res.json(customers);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 2. POST /api/customers — Create a new customer (tenant-scoped)
router.post('/', async (req: Request, res: Response) => {
  const { firstName, lastName, email, phone, notes } = req.body;
  const orgId = req.user!.orgId;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        orgId,
        firstName,
        lastName,
        email,
        phone,
        notes,
      },
    });

    return res.status(201).json(customer);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 3. GET /api/customers/:id — Get a single customer with properties (tenant-scoped)
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.user!.orgId;

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        orgId,
      },
      include: {
        properties: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    return res.json(customer);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 4. PUT /api/customers/:id — Update customer details (tenant-scoped)
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { firstName, lastName, email, phone, notes } = req.body;
  const orgId = req.user!.orgId;

  try {
    // Verify customer belongs to tenant
    const customerExists = await prisma.customer.findFirst({
      where: { id, orgId },
    });

    if (!customerExists) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        phone,
        notes,
      },
    });

    return res.json(updatedCustomer);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 5. DELETE /api/customers/:id — Hard/Soft Delete (tenant-scoped)
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.user!.orgId;

  try {
    const customerExists = await prisma.customer.findFirst({
      where: { id, orgId },
    });

    if (!customerExists) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Hard delete since SQLite uses cascade onDelete definitions
    await prisma.customer.delete({
      where: { id },
    });

    return res.json({ message: 'Customer and associated properties deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 6. GET /api/customers/:id/properties — List properties for a specific customer (tenant-scoped)
router.get('/:id/properties', async (req: Request, res: Response) => {
  const { id } = req.params;
  const orgId = req.user!.orgId;

  try {
    const customer = await prisma.customer.findFirst({
      where: { id, orgId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const properties = await prisma.property.findMany({
      where: {
        customerId: id,
        orgId,
      },
    });

    return res.json(properties);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 7. POST /api/customers/:id/properties — Create a property for a customer (tenant-scoped)
router.post('/:id/properties', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { streetAddress, city, state, zipCode, latitude, longitude, irrigationZonesCount, waterShutoffLocation } = req.body;
  const orgId = req.user!.orgId;

  if (!streetAddress || !city || !state || !zipCode) {
    return res.status(400).json({ error: 'Street address, city, state, and zip code are required.' });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id, orgId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const property = await prisma.property.create({
      data: {
        orgId,
        customerId: id,
        streetAddress,
        city,
        state,
        zipCode,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        irrigationZonesCount: irrigationZonesCount ? parseInt(irrigationZonesCount) : 1,
        waterShutoffLocation,
      },
    });

    return res.status(201).json(property);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
