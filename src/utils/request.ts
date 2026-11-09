import type { HttpHeaderName } from '@/types';
import type { Request } from 'express';

export const getHeader = (
  req: Request,
  name: HttpHeaderName,
): string | undefined => {
  return req.get(name);
};

export const getClientIp = (req: Request): string => {
  const forwarded = req.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
};

export const getUserAgent = (req: Request): string => {
  return req.get('user-agent') || 'unknown';
};
