import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import type { AuthRequest, JwtPayload } from '@/types';
import { UnauthorizedError } from '@/errors/app.error';
import { redisClient } from '@/config/redis';

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  let token: string | undefined;

  // Prefer explicit Authorization header, fallback to cookie
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (
    typeof req.cookies?.token === 'string' &&
    req.cookies.token.length > 0
  ) {
    token = req.cookies.token;
  }

  if (!token) {
    next(new UnauthorizedError('No authentication token provided'));
    return;
  }

  try {
    if (env.NODE_ENV !== 'test') {
      const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
      if (isBlacklisted) {
        next(new UnauthorizedError('Token has been revoked'));
        return;
      }
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired tokens'));
  }
};
