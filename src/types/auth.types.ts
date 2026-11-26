import type { Request } from 'express';
import type { ParamsDictionary, Query } from 'express-serve-static-core';

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

export interface AuthRequest<
  P = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Query,
> extends Request<P, ResBody, ReqBody, ReqQuery> {
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

export interface VerifyPayload {
  userId: string;
  is2FAPending?: boolean;
}

export interface DeviceTrustPayload {
  trusted: boolean;
  ua: string;
}

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}
