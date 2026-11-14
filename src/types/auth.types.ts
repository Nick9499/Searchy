import type { Request } from 'express';

export type UserRole = 'super_admin' | 'org_admin' | 'member';

export interface UserSession {
  id: string;
  userId: string;
  orgId: string;
  role: UserRole;
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
}

export interface AuthCookies {
  token?: string;
  [key: string]: string | undefined;
}

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
  orgId?: string;
  role?: UserRole;
  cookies: AuthCookies;
}

export interface SessionUserData {
  id: string;
  orgId?: string | null;
  role?: UserRole | null;
}
