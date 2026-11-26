import { env } from '@/config/env';
import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'token';
export const SESSION_PREFIX = 'session:';
export const USER_SESSIONS_PREFIX = 'user_sessions:';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_ID_BYTES = 32;

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

export const DEVICE_TRUST_COOKIE_NAME = 'searchy-device-trust';
export const DEVICE_TRUST_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const DEVICE_TRUST_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: DEVICE_TRUST_TTL_SECONDS * 1000,
};

export const HANDSHAKE_NONCE_PREFIX = 'handshake:';
export const HANDSHAKE_NONCE_TTL_SECONDS = 120;

export const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
