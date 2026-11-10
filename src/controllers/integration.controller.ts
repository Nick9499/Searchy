import { db } from '@/db';
import { userIntegrations } from '@/db/schema';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '@/errors/app.error';
import { providerRegistry } from '@/integrations';
import { importQueue } from '@/jobs/queue';
import type { AuthRequest } from '@/types';
import { isInvalidGrantError } from '@/utils/oauth';
import type { ImportCloudItemInput } from '@/validators/integration.validator';
import { and, eq } from 'drizzle-orm';
import type { Response } from 'express';

export const getProviderAuthUrl = (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const provierName = String(req.params.provider);

  const provider = providerRegistry.get(provierName);

  const authUrl = provider.getAuthUrl(req.userId);
  res.json({ authUrl });
};

export const handleProviderCallback = async (
  req: AuthRequest,
  res: Response,
) => {
  const providerName = String(req.params.provider);
  const code = req.query.code as string;
  const userId = req.query.state as string;

  if (!code || !userId) {
    throw new BadRequestError('Missing authorization code or state');
  }

  const provider = providerRegistry.get(providerName);
  const tokens = await provider.exchangeCode(code);

  const [existing] = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, providerName),
      ),
    );

  if (existing) {
    await db
      .update(userIntegrations)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || existing.refreshToken,
        expiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(userIntegrations.id, existing.id));
  } else {
    await db.insert(userIntegrations).values({
      accessToken: tokens.accessToken,
      provider: providerName,
      userId,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  }

  res.json({ message: `Successfully connected ${providerName}!` });
};

export const listRemoteFiles = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const providerName = String(req.params.provider);
  const remoteFolderId = req.query.folderId as string | undefined;

  const [integrations] = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, req.userId),
        eq(userIntegrations.provider, providerName),
      ),
    );

  if (!integrations) {
    throw new NotFoundError(`Account is not connected to ${providerName}`);
  }

  const provider = providerRegistry.get(providerName);
  try {
    const items = await provider.listItems(
      {
        accessToken: integrations.accessToken,
        expiresAt: integrations.expiresAt,
        refreshToken: integrations.refreshToken,
      },
      remoteFolderId,
    );
    res.json({ items });
  } catch (error: unknown) {
    if (isInvalidGrantError(error)) {
      await db
        .delete(userIntegrations)
        .where(
          and(
            eq(userIntegrations.userId, req.userId),
            eq(userIntegrations.provider, providerName),
          ),
        );

      throw new UnauthorizedError(
        'Google drive connection has expired or been revoked. Please reconnect your account',
      );
    }

    throw error;
  }
};

export const startCloudImport = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const providerName = String(req.params.provider);
  const { remoteItemId, targetFolderId } = req.body as ImportCloudItemInput;

  const [integration] = await db
    .select()
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, req.userId),
        eq(userIntegrations.provider, providerName),
      ),
    );

  if (!integration) {
    throw new NotFoundError(`Account is not connected to ${providerName}`);
  }

  const job = await importQueue.add(
    `import-${providerName}-${Date.now()}`,
    {
      userId: req.userId,
      provider: providerName,
      remoteItemId,
      targetFolderId,
    },
    { removeOnComplete: 10, removeOnFail: 50 },
  );

  res
    .status(202)
    .json({ message: 'Import job scheduled successfully', jobId: job.id });
};
