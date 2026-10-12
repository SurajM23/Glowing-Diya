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
  const token = jwt.sign({ sub: String(admin.id), email: admin.email, kind: 'admin' }, env.jwtSecret, { expiresIn: '12h' });
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
    const p = jwt.verify(token, env.jwtSecret) as { sub: string; email: string; kind?: string };
    if (p.kind !== 'admin') throw new Error('not an admin token');
    req.admin = { id: Number(p.sub), email: p.email };
    next();
  } catch {
    next(new HttpError(401, 'Session expired. Please sign in again'));
  }
}

// ---------- optional customer accounts (order tracking) ----------

export const CUSTOMER_COOKIE = 'gd_customer';

declare module 'express-serve-static-core' {
  interface Request {
    customer?: { id: number; name: string; phone: string };
  }
}

export function issueCustomerSession(res: Response, c: { id: number; name: string; phone: string }) {
  const token = jwt.sign({ sub: String(c.id), name: c.name, phone: c.phone, kind: 'customer' }, env.jwtSecret, { expiresIn: '180d' });
  res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: 'lax', maxAge: 180 * 24 * 60 * 60 * 1000, path: '/' });
}

export function clearCustomerSession(res: Response) {
  res.clearCookie(CUSTOMER_COOKIE, { httpOnly: true, secure: env.isProd, sameSite: 'lax', path: '/' });
}

/** Reads the customer cookie if present; never rejects. */
export function optionalCustomer(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (token) {
    try {
      const p = jwt.verify(token, env.jwtSecret) as { sub: string; name: string; phone: string; kind?: string };
      if (p.kind === 'customer') req.customer = { id: Number(p.sub), name: p.name, phone: p.phone };
    } catch { /* expired or invalid: treat as signed out */ }
  }
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  if (!req.customer) return next(new HttpError(401, 'Please sign in'));
  next();
}
