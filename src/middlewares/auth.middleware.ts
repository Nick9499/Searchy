import type { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import type { AuthRequest, JwtPayload } from '@/types';
import { UnauthorizedError } from '@/errors/app.error';
import { redisClient } from '@/config/redis';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

    if (decoded.tokenVersion !== undefined) {
      let currentVersion: number | null = null;

      if (redisClient.status === 'ready') {
        const cache = await redisClient.get(
          `user_token_version:${decoded.userId}`,
        );
        if (cache !== null) {
          currentVersion = Number.parseInt(cache, 10);
        }
      }

      if (currentVersion === null) {
        const [user] = await db
          .select({ tokenVersion: users.tokenVersion })
          .from(users)
          .where(eq(users.id, decoded.userId));

        if (!user) {
          next(new UnauthorizedError('User not found'));
          return;
        }

        currentVersion = user.tokenVersion;

        if (redisClient.status === 'ready') {
          await redisClient.set(
            `user_token_version:${decoded.userId}`,
            String(currentVersion),
            'EX',
            3600,
          );
        }
      }

      if (decoded.tokenVersion < currentVersion) {
        next(new UnauthorizedError('Session has expired. Please login again'));
        return;
      }
    }

    req.userId = decoded.userId;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired tokens'));
  }
};
