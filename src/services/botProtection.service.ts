import { redisClient } from '@/config/redis';
import {
  DEVICE_TRUST_TTL_SECONDS,
  HANDSHAKE_NONCE_PREFIX,
  HANDSHAKE_NONCE_TTL_SECONDS,
  TURNSTILE_VERIFY_URL,
} from '@/constants';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import type { DeviceTrustPayload, TurnstileVerifyResponse } from '@/types';
import { logger } from '@/config/logger';

const hashUserAgent = (userAgent: string): string => {
  return crypto.createHash('sha256').update(userAgent).digest('hex');
};

export const issueHandshakeNonce = async (): Promise<string> => {
  const nonce = crypto.randomBytes(32).toString('hex');
  await redisClient.set(
    `${HANDSHAKE_NONCE_PREFIX}${nonce}`,
    '1',
    'EX',
    HANDSHAKE_NONCE_TTL_SECONDS,
  );

  return nonce;
};

export const consumeHandshakeNonce = async (
  nonce: string,
): Promise<boolean> => {
  const value = await redisClient.getdel(`${HANDSHAKE_NONCE_PREFIX}${nonce}`);
  return value === '1';
};

export const createDeviceTrustToken = (userAgent: string): string => {
  const payload: DeviceTrustPayload = {
    trusted: true,
    ua: hashUserAgent(userAgent),
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: DEVICE_TRUST_TTL_SECONDS,
  });
};

export const verifyDeviceTrustToken = (token: string, userAgent: string) => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as DeviceTrustPayload;
    return decoded.trusted === true && decoded.ua === hashUserAgent(userAgent);
  } catch (_) {
    return false;
  }
};

export const verifyTurnstileToken = async (
  token: string,
  remoteIp?: string,
) => {
  if (!env.TURNSTILE_SECRET_KEY) {
    return false;
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteIp,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as TurnstileVerifyResponse;
    return data.success;
  } catch (err) {
    logger.error({ err }, 'Turnstile verification request failed');
    return false;
  }
};
