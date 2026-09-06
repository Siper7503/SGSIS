import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const developmentSecret = 'development-only-change-this-secret';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET doit être configuré en production.');
  }

  return developmentSecret;
}

export function createOneTimeToken(prefix = 'SGSIED'): string {
  return `${prefix}-${randomBytes(18).toString('base64url')}`;
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function secretsMatch(value: string, hashedValue: string | null | undefined): boolean {
  if (!hashedValue) {
    return false;
  }

  const actual = Buffer.from(hashSecret(value), 'utf8');
  const expected = Buffer.from(hashedValue, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signSession(payload: Record<string, unknown>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
}

export function verifySession(token: string): Record<string, unknown> {
  return jwt.verify(token, getJwtSecret()) as Record<string, unknown>;
}
