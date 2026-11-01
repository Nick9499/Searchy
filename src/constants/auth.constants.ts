import { env } from '@/config/env';
import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'token';

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
};

export const PERIODIC_VERIFICATION_DAYS = 30;
export const JWT_EXPIRY = '7d';
