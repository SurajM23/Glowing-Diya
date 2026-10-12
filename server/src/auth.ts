import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from './config';
import { HttpError } from './lib/orders';

export const COOKIE = 'gd_admin';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function issueSession(res: Response, admin: { id: number; email: string }) {
  const token = jwt.sign({ sub: String(admin.id), email: admin.email }, env.jwtSecret, { expiresIn: '12h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    // Client and API are served from the same origin (see app.ts), so 'lax' always applies —
    // no third-party-cookie issues on Safari/iOS, unlike a 'none' cookie across two hosts.
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/' });
}

declare module 'express-serve-static-core' {
  interface Request {
    admin?: { id: number; email: string };
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    const p = jwt.verify(token, env.jwtSecret) as { sub: string; email: string };
    req.admin = { id: Number(p.sub), email: p.email };
    next();
  } catch {
    next(new HttpError(401, 'Session expired. Please sign in again'));
  }
}
