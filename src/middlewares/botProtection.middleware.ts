import { env } from '@/config/env';
import {
  DEVICE_TRUST_COOKIE_NAME,
  DEVICE_TRUST_COOKIE_OPTIONS,
} from '@/constants';
import { ForbiddenError } from '@/errors/app.error';
import {
  consumeHandshakeNonce,
  createDeviceTrustToken,
  verifyDeviceTrustToken,
  verifyTurnstileToken,
} from '@/services/botProtection.service';
import { getClientIp, getUserAgent } from '@/utils/request';
import type { NextFunction, Request, Response } from 'express';

const getCaptchaToken = (req: Request): string | undefined => {
  const headerToken = req.headers['x-captcha-token'];

  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }

  if (
    req.body &&
    typeof req.body === 'object' &&
    'captchaToken' in req.body &&
    typeof req.body.captchaToken === 'string'
  ) {
    return req.body.captchaToken;
  }

  return undefined;
};

export const verifyBotProtection = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (env.NODE_ENV === 'test') {
    next();
    return;
  }

  const nonce = req.headers['x-handshake-nonce'];

  if (typeof nonce !== 'string' || !(await consumeHandshakeNonce(nonce))) {
    throw new ForbiddenError(
      'Invalid or expired security handshake. Please try again',
    );
  }

  const trustCookie = req.cookies?.[DEVICE_TRUST_COOKIE_NAME];
  const userAgent = getUserAgent(req);

  if (
    typeof trustCookie === 'string' &&
    verifyDeviceTrustToken(trustCookie, userAgent)
  ) {
    next();
    return;
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const captchaToken = getCaptchaToken(req);

    if (!captchaToken) {
      res.status(403).json({
        status: 'error',
        message: 'CAPTCHA verification failed. Please try again',
        requiresCaptcha: true,
      });
      return;
    }

    const isHuman = await verifyTurnstileToken(captchaToken, getClientIp(req));

    if (!isHuman) {
      res.status(403).json({
        status: 'error',
        message: 'CaAPTCHA verification failed. Please try again',
        requiresCaptcha: true,
      });
      return;
    }
  }

  const trustToken = createDeviceTrustToken(userAgent);

  res.cookie(DEVICE_TRUST_COOKIE_NAME, trustToken, DEVICE_TRUST_COOKIE_OPTIONS);

  next();
};
