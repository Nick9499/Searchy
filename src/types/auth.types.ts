import type { Request } from 'express';

export interface JwtPayload {
  userId: string;
  tokenVersion?: number;
}

export interface AuthCookies {
  token?: string;
  [key: string]: string | undefined;
}

export interface AuthRequest extends Request {
  userId?: string;
  cookies: AuthCookies;
}
