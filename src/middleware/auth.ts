import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { verifySession } from '../lib/auth-security.ts';

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
