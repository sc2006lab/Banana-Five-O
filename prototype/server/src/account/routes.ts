// UC-1.1 – UC-1.5: register, login/logout, reset password, manage display name, delete account.
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  LOCKOUT_MINUTES,
  LOCKOUT_THRESHOLD,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateAccountSchema,
} from '@famplan/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, parse } from '../lib/http.js';
import { sendMail } from './mailer.js';
import { ARGON2_PARAMS_LABEL, dummyVerify, hashPassword, verifyPassword } from './passwords.js';
import { SESSION_COOKIE, clearSessionCookie, createSession, hashToken, newToken, requireUser } from './sessions.js';

export const GENERIC_LOGIN_FAILURE =
  'Email or password is incorrect, or the account is temporarily locked after repeated failed attempts. Try again later or reset your password.';
export const GENERIC_RESET_RESPONSE = 'If an account exists for that email, we have sent a password-reset link. It expires in 30 minutes.';

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.isTest ? 1000 : 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts from this network. Please wait a few minutes and try again.' },
});

export const accountRouter = Router();

accountRouter.post('/auth/register', authLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const exists = await prisma.userAccount.findUnique({ where: { email: input.email } });
  if (exists) throw new HttpError(409, 'An account with this email already exists.', { email: 'An account with this email already exists. Sign in or reset your password.' });
  const saltedHash = await hashPassword(input.password);
  const account = await prisma.userAccount.create({
    data: {
      displayName: input.displayName,
      email: input.email,
      consentGivenAt: new Date(),
      credential: { create: { saltedHash, algorithm: 'argon2id', parameters: ARGON2_PARAMS_LABEL } },
      preference: { create: { familyStages: [], preferredAreas: [], confirmedWeights: [] } },
    },
  });
  await createSession(res, account.id);
  res.status(201).json({ id: account.id, displayName: account.displayName, email: account.email, role: account.role });
});

accountRouter.post('/auth/login', authLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const account = await prisma.userAccount.findUnique({ where: { email: input.email }, include: { credential: true } });
  if (!account || !account.credential) {
    await dummyVerify(input.password);
    throw new HttpError(401, GENERIC_LOGIN_FAILURE);
  }
  const now = new Date();
  if (account.lockedUntil && account.lockedUntil > now) {
    await dummyVerify(input.password);
    throw new HttpError(401, GENERIC_LOGIN_FAILURE);
  }
  const ok = await verifyPassword(account.credential.saltedHash, input.password);
  if (!ok) {
    const failures = account.failedLoginCount + 1;
    const lock = failures >= LOCKOUT_THRESHOLD;
    await prisma.userAccount.update({
      where: { id: account.id },
      data: {
        failedLoginCount: lock ? 0 : failures,
        lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : account.lockedUntil,
        status: lock ? 'LOCKED' : account.status,
      },
    });
    throw new HttpError(401, GENERIC_LOGIN_FAILURE);
  }
  await prisma.userAccount.update({ where: { id: account.id }, data: { failedLoginCount: 0, lockedUntil: null, status: 'ACTIVE' } });
  await createSession(res, account.id);
  res.json({ id: account.id, displayName: account.displayName, email: account.email, role: account.role });
});

accountRouter.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') await prisma.session.updateMany({ where: { tokenHash: hashToken(token), invalidatedAt: null }, data: { invalidatedAt: new Date() } });
  clearSessionCookie(res);
  res.json({ ok: true });
});

accountRouter.get('/auth/me', (req, res) => {
  res.json(req.user ?? null);
});

accountRouter.post('/auth/forgot-password', authLimiter, async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const account = await prisma.userAccount.findUnique({ where: { email } });
  if (account) {
    const token = newToken();
    await prisma.passwordResetToken.create({
      data: { tokenHash: hashToken(token), accountId: account.id, expiresAt: new Date(Date.now() + config.resetTokenTtlMinutes * 60_000) },
    });
    await sendMail({
      to: account.email,
      subject: 'Reset your FamPlan password',
      text: `Hi ${account.displayName},\n\nUse this link within ${config.resetTokenTtlMinutes} minutes to choose a new password:\n${config.appOrigin}/reset-password?token=${token}\n\nIf you did not ask for this, you can ignore this email.`,
    });
  }
  res.status(202).json({ message: GENERIC_RESET_RESPONSE });
});

accountRouter.post('/auth/reset-password', authLimiter, async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const rt = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!rt || rt.usedAt || rt.expiresAt < new Date())
    throw new HttpError(400, 'This reset link is invalid, already used, or expired. Request a new link.', { token: 'Request a new reset link.' });
  const saltedHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: rt.id }, data: { usedAt: new Date() } }),
    prisma.passwordCredential.update({ where: { accountId: rt.accountId }, data: { saltedHash, parameters: ARGON2_PARAMS_LABEL } }),
    prisma.userAccount.update({ where: { id: rt.accountId }, data: { failedLoginCount: 0, lockedUntil: null, status: 'ACTIVE' } }),
    prisma.session.updateMany({ where: { accountId: rt.accountId, invalidatedAt: null }, data: { invalidatedAt: new Date() } }),
  ]);
  res.json({ message: 'Your password has been reset. Please sign in with your new password.' });
});

accountRouter.patch('/account', requireUser, async (req, res) => {
  const { displayName } = parse(updateAccountSchema, req.body);
  const a = await prisma.userAccount.update({ where: { id: req.user!.id }, data: { displayName } });
  res.json({ id: a.id, displayName: a.displayName, email: a.email, role: a.role });
});

accountRouter.delete('/account', requireUser, async (req, res) => {
  parse(deleteAccountSchema, req.body);
  // Cascades to credential, sessions, reset tokens, preferences, destinations, shortlist and notes (FR-ACC-06, NFR-PRIV-01).
  await prisma.userAccount.delete({ where: { id: req.user!.id } });
  clearSessionCookie(res);
  res.json({ message: 'Your account and all saved preferences, shortlist entries and notes have been deleted.' });
});
