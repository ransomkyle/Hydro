import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'sprinksoft_secret_key_123';

// 1. POST /api/auth/register - Creates organization + admin user
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, orgName, phone } = req.body;

  if (!email || !password || !firstName || !lastName || !orgName) {
    return res.status(400).json({ error: 'All fields are required except phone.' });
  }

  try {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create Organization and Admin User in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          subscriptionTier: 'Starter',
        },
      });

      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email,
          passwordHash,
          firstName,
          lastName,
          role: 'admin',
          phone,
        },
      });

      // Automatically create a main warehouse for the new organization
      await tx.warehouse.create({
        data: {
          orgId: org.id,
          name: 'Main Warehouse',
          isMobile: false,
        },
      });

      return { org, user };
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: result.user.id,
        orgId: result.org.id,
        email: result.user.email,
        role: result.user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    });

    const { passwordHash: _, ...userWithoutPassword } = result.user;

    return res.status(201).json({
      message: 'Registration successful.',
      user: userWithoutPassword,
      organization: result.org,
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 2. POST /api/auth/login - Authenticate user and return token in cookie
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    });

    const { passwordHash: _, ...userWithoutPassword } = user;

    return res.json({
      message: 'Login successful.',
      user: userWithoutPassword,
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

// 3. POST /api/auth/logout - Clear cookie
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully.' });
});

// 4. GET /api/auth/me - Return profile info of current authenticated user
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { organization: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return res.json(userWithoutPassword);
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
