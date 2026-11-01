import type { Request } from 'express';

export interface JwtPayload {
  userId: string;
}

export interface AuthCookies {
  token?: string;
  [key: string]: string | undefined;
}

export interface AuthRequest extends Request {
  userId?: string;
  cookies: AuthCookies;
}
