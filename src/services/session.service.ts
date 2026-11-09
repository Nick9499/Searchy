import { redisClient } from '@/config/redis';
import {
  SESSION_ID_BYTES,
  SESSION_PREFIX,
  SESSION_TTL_SECONDS,
  USER_SESSIONS_PREFIX,
} from '@/constants';
import type { SessionDeviceInfo, UserSession } from '@/types';
import { getClientIp, getUserAgent } from '@/utils/request';
import type { Request } from 'express';
import crypto from 'node:crypto';

export const createSession = async (
  userId: string,
  req: Request,
): Promise<string> => {
  const sessionId = crypto.randomBytes(SESSION_ID_BYTES).toString('hex');
  const now = new Date().toISOString();

  const session: UserSession = {
    id: sessionId,
    ip: getClientIp(req),
    createdAt: now,
    lastActiveAt: now,
    userAgent: getUserAgent(req),
    userId,
  };

  await redisClient.set(
    `${SESSION_PREFIX}${sessionId}`,
    JSON.stringify(session),
    'EX',
    SESSION_TTL_SECONDS,
  );

  await redisClient.sadd(`${USER_SESSIONS_PREFIX}${userId}`, sessionId);

  return sessionId;
};

export const getSession = async (
  sessionId: string,
): Promise<UserSession | null> => {
  const raw = await redisClient.get(`${SESSION_PREFIX}${sessionId}`);

  if (!raw) return null;

  try {
    const session: UserSession = JSON.parse(raw);
    const lastActive = new Date(session.lastActiveAt).getTime();
    const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;

    if (lastActive < fifteenMinsAgo) {
      session.lastActiveAt = new Date().toISOString();
      await redisClient.set(
        `${SESSION_PREFIX}${sessionId}`,
        JSON.stringify(session),
        'EX',
        SESSION_TTL_SECONDS,
      );
    }
    return session;
  } catch (_) {
    return null;
  }
};

export const destroySession = async (
  sessionId: string,
  userId?: string,
): Promise<void> => {
  let resolvedUserId = userId;

  if (!resolvedUserId) {
    const session = await getSession(sessionId);
    resolvedUserId = session?.userId || '';
  }

  await redisClient.del(`${SESSION_PREFIX}${sessionId}`);

  if (resolvedUserId) {
    await redisClient.srem(
      `${USER_SESSIONS_PREFIX}${resolvedUserId}`,
      sessionId,
    );
  }
};

export const destroyAllUserSessions = async (
  userId: string,
  exceptSessionId?: string,
): Promise<void> => {
  const sessionIds = await redisClient.smembers(
    `${USER_SESSIONS_PREFIX}${userId}`,
  );

  if (sessionIds.length === 0) return;
  const pipeline = redisClient.pipeline();

  for (const sId of sessionIds) {
    if (exceptSessionId && exceptSessionId === sId) continue;
    pipeline.del(`${SESSION_PREFIX}${sId}`);
    pipeline.srem(`${USER_SESSIONS_PREFIX}${userId}`, sId);
  }

  await pipeline.exec();
};

export const getUserSessions = async (
  userId: string,
  currentSessionId?: string,
): Promise<SessionDeviceInfo[]> => {
  const sessionIds = await redisClient.smembers(
    `${USER_SESSIONS_PREFIX}${userId}`,
  );

  if (sessionIds.length === 0) return [];

  const keys = sessionIds.map((id) => `${SESSION_PREFIX}${id}`);
  const rawSessions = await redisClient.mget(keys);

  const activeSessions: SessionDeviceInfo[] = [];
  const expiredSessionIds: string[] = [];

  for (let i = 0; i < rawSessions.length; i++) {
    const raw = rawSessions[i];
    const sId = sessionIds[i];

    if (!raw) {
      expiredSessionIds.push(sId);
      continue;
    }

    try {
      const parsed: UserSession = JSON.parse(raw);
      activeSessions.push({
        id: parsed.id,
        ip: parsed.ip,
        current: parsed.id === currentSessionId,
        userAgent: parsed.userAgent,
        createdAt: parsed.createdAt,
        lastActiveAt: parsed.lastActiveAt,
      });
    } catch (_) {
      expiredSessionIds.push(sId);
    }
  }

  if (expiredSessionIds.length > 0) {
    await redisClient.srem(
      `${USER_SESSIONS_PREFIX}${userId}`,
      ...expiredSessionIds,
    );
  }

  return activeSessions.sort((a, b) => {
    if (a.current) return -1;
    if (b.current) return 1;
    return (
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  });
};

export const revokeUserSession = async (
  userId: string,
  sessionIdToRevoke: string,
): Promise<boolean> => {
  const isMember = await redisClient.sismember(
    `${USER_SESSIONS_PREFIX}${userId}`,
    sessionIdToRevoke,
  );

  if (!isMember) return false;

  await destroySession(sessionIdToRevoke, userId);
  return true;
};
