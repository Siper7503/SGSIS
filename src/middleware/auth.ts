import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { verifySession } from '../lib/auth-security.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: DecodedIdToken & {
    id?: number;
    role?: string;
    etablissementId?: number | null;
    arrondissement?: string | null;
    nom?: string | null;
    prenom?: string | null;
    telephone?: string | null;
    rights?: string | null;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  
  // Try verifying as custom JWT first
  try {
    const decoded = verifySession(token) as any;
    if (decoded.id) {
      const rows = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, decoded.id)).limit(1);
      if (rows[0]?.isActive === false) {
        res.status(403).json({ error: 'Ce compte a ete desactive. La session a ete revoquee.' });
        return;
      }
    }
    req.user = decoded;
    next();
    return;
  } catch (jwtError) {
    // If JWT verification fails, fallback to Firebase ID Token
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      console.error('Error verifying both JWT and Firebase ID token:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }
  }
};
