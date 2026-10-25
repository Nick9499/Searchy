import type { Request } from 'express';

export interface JwtPayload {
  userId: string;
}

export interface AuthRequest extends Request {
  userId?: string;
}
