import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '@/types';
import { UnauthorizedError } from '@/errors/app.error';
import { getSession } from '@/services/session.service';

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
    const session = await getSession(token);

    if (!session) {
      next(new UnauthorizedError('Invalid or expired session'));
      return;
    }

    req.userId = session.userId;
    req.sessionId = session.id;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired tokens'));
  }
};
