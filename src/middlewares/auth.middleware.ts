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

  if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
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
