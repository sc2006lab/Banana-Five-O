// Server-side sessions (tech-stack recommendation). Only a SHA-256 hash of the session token is stored.
import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Me } from '@famplan/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../lib/http.js';

export const SESSION_COOKIE = 'famplan_sid';

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Me;
      sessionId?: string;
    }
  }
}

export async function createSession(res: Response, accountId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), accountId, expiresAt } });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    expires: expiresAt,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProduction });
}

/** Attach req.user when a valid, unexpired, non-invalidated session cookie is present. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { account: true } });
    if (s && !s.invalidatedAt && s.expiresAt > new Date()) {
      req.user = { id: s.account.id, displayName: s.account.displayName, email: s.account.email, role: s.account.role };
      req.sessionId = s.id;
    }
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to use this feature.'));
  next();
}

/** Role check enforced at the API level (FR-ADM-01, NFR-SEC-03). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in as a data administrator.'));
  if (req.user.role !== 'DATA_ADMINISTRATOR') return next(new HttpError(403, 'Only data administrators can view data-source monitoring.'));
  next();
}
