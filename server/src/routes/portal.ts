import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Simple session tokens (in-memory for MVP — use Redis in production)
const portalSessions = new Map<string, { customerId: string; orgId: string; email: string; expires: number }>();

function generatePortalCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of portalSessions) {
    if (session.expires < now) portalSessions.delete(token);
  }
}, 60000);

// 1. POST /portal/login — authenticate customer
router.post('/login', async (req: Request, res: Response) => {
  const { email, portalCode } = req.body;

  if (!email || !portalCode) {
    return res.status(400).json({ error: 'Email and portal code are required.' });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { email: email.toLowerCase().trim(), portalCode: portalCode.trim().toUpperCase() },
      select: { id: true, orgId: true, email: true, firstName: true, lastName: true, portalCode: true },
    });

    if (!customer) {
      return res.status(401).json({ error: 'Invalid email or portal code.' });
    }

    // Create session token (24h expiry)
    const token = generateSessionToken();
    portalSessions.set(token, {
      customerId: customer.id,
      orgId: customer.orgId,
      email: customer.email || '',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    return res.json({
      token,
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// Portal auth middleware
function portalAuth(req: Request, res: Response, next: Function) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token as string;

  if (!token) {
    return res.status(401).json({ error: 'No session token provided.' });
  }

  const session = portalSessions.get(token);
  if (!session || session.expires < Date.now()) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  (req as any).portalCustomer = session;
  next();
}

router.use(portalAuth);

// 2. GET /portal/jobs — get customer's jobs
router.get('/jobs', async (req: Request, res: Response) => {
  const { customerId, orgId } = (req as any).portalCustomer;

  try {
    const jobs = await prisma.job.findMany({
      where: {
        orgId,
        property: { customerId },
      },
      include: {
        property: true,
        assignedTech: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { scheduledStart: 'desc' },
    });

    return res.json(jobs);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 3. GET /portal/invoices — get customer's invoices
router.get('/invoices', async (req: Request, res: Response) => {
  const { customerId, orgId } = (req as any).portalCustomer;

  try {
    const invoices = await prisma.invoice.findMany({
      where: { orgId, customerId },
      include: {
        job: { include: { property: true } },
        quote: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(invoices);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 4. GET /portal/customer — get customer profile
router.get('/customer', async (req: Request, res: Response) => {
  const { customerId } = (req as any).portalCustomer;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { properties: true },
    });

    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    return res.json(customer);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 5. POST /portal/service-request — create a job from customer request
router.post('/service-request', async (req: Request, res: Response) => {
  const { customerId, orgId } = (req as any).portalCustomer;
  const { propertyId, jobType, description, preferredDate, preferredTime } = req.body;

  if (!propertyId || !jobType) {
    return res.status(400).json({ error: 'Property and job type are required.' });
  }

  try {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, customerId, orgId },
    });

    if (!property) {
      return res.status(400).json({ error: 'Invalid property.' });
    }

    const scheduledStart = preferredDate && preferredTime
      ? new Date(`${preferredDate}T${preferredTime}:00`)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days from now

    const job = await prisma.job.create({
      data: {
        orgId,
        propertyId,
        jobType,
        status: 'draft',
        scheduledStart,
        scheduledEnd: new Date(scheduledStart.getTime() + 2 * 60 * 60 * 1000),
        notes: description || null,
      },
    });

    return res.status(201).json(job);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// Helper: generate portal code for a customer
export async function ensurePortalCode(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (customer && !customer.portalCode) {
    let code: string;
    let exists = true;
    while (exists) {
      code = generatePortalCode();
      const found = await prisma.customer.findUnique({ where: { portalCode: code } });
      if (!found) { exists = false; }
    }
    await prisma.customer.update({ where: { id: customerId }, data: { portalCode: code! } });
  }
}

export default router;