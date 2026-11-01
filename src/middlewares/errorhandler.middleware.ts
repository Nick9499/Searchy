import { AppError } from '@/errors/app.error';
import { env } from '@/config/env';
import type { NextFunction, Request, Response } from 'express';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  console.error('[Unhandled Exception]:', err);

  res.status(500).json({
    status: 'error',
    message:
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error',
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
