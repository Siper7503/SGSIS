import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySession } from '../lib/auth-security.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import type { SessionUser } from '../lib/shared-types.ts';

export interface AuthenticatedUser extends SessionUser {
  uid: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

function authenticatedUserFromSession(payload: Record<string, unknown>): AuthenticatedUser {
  if (typeof payload.uid !== 'string' || !payload.uid) {
    throw new Error('Session token is missing a valid uid');
  }
  return {
    uid: payload.uid,
    id: typeof payload.id === 'number' ? payload.id : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    etablissementId: typeof payload.etablissementId === 'number' ? payload.etablissementId : null,
    arrondissement: typeof payload.arrondissement === 'string' ? payload.arrondissement : null,
    nom: typeof payload.nom === 'string' ? payload.nom : null,
    prenom: typeof payload.prenom === 'string' ? payload.prenom : null,
    telephone: typeof payload.telephone === 'string' ? payload.telephone : null,
    rights: typeof payload.rights === 'string' ? payload.rights : null,
    isActive: typeof payload.isActive === 'boolean' ? payload.isActive : undefined,
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
    const decoded = authenticatedUserFromSession(verifySession(token));
    if (decoded.id) {
      const rows = await db.select({
        isActive: users.isActive,
        role: users.role,
        etablissementId: users.etablissementId,
      }).from(users).where(eq(users.id, decoded.id)).limit(1);
      if (!rows[0] || rows[0].isActive === false) {
        res.status(403).json({ error: 'Ce compte a ete desactive. La session a ete revoquee.' });
        return;
      }
      decoded.role = rows[0].role;
      decoded.etablissementId = rows[0].etablissementId;
    }
    req.user = decoded;
    next();
    return;
  } catch (jwtError) {
    // If JWT verification fails, fallback to Firebase ID Token
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = authenticatedUserFromSession({ ...decodedToken, uid: decodedToken.uid });
      next();
    } catch (error) {
      console.error('Error verifying both JWT and Firebase ID token:', error);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }
  }
};
