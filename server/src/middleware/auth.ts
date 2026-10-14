import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sprinksoft_secret_key_123';

export interface UserPayload {
  id: string;
  orgId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

// Middleware to authenticate JWT from cookie or Authorization header
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// Middleware to scope requests by tenant
export const requireTenant = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.orgId) {
    return res.status(401).json({ error: 'Access denied. No tenant scope found.' });
  }
  next();
};

// Middleware to restrict routes by role
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
    }

    next();
  };
};
