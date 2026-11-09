import type { Request } from 'express';

export interface UserSession {
  id: string;
  userId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface SessionDeviceInfo {
  id: string;
  current: boolean;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
}

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
  sessionId?: string;
  cookies: AuthCookies;
}
