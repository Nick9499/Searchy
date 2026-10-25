import { db } from '@/db';
import { userIntegrations } from '@/db/schema';
import { providerRegistry } from '@/integrations';
import { importQueue } from '@/jobs/queue';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import type { ImportCloudItemInput } from '@/validators/integration.validator';
import { and, eq } from 'drizzle-orm';
import type { Response } from 'express';

export const getProviderAuthUrl = (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorize' });
    return;
  }

  const provierName = String(req.params.provider);

  try {
    const provider = providerRegistry.get(provierName);

    const authUrl = provider.getAuthUrl(req.userId);
    res.json({ authUrl });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const handleProviderCallback = async (
  req: AuthRequest,
  res: Response,
) => {
  const providerName = String(req.params.provider);
  const code = req.query.code as string;
  const userId = req.query.state as string;

  if (!code || !userId) {
    res.status(400).json({ message: 'Missing authorization code or state' });
    return;
  }

  try {
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
  } catch (error: any) {
    console.error(`[Integration Callback Error] ${providerName}:`, error);
    res.status(500).json({ message: 'Failed to complete OAuth authorization' });
  }
};

export const listRemoteFiles = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorize' });
    return;
  }

  const providerName = String(req.params.provider);
  const remoteFolderId = req.query.folderId as string | undefined;

  try {
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
      res
        .status(400)
        .json({ message: `Account is not connected to ${providerName}` });
      return;
    }

    const provider = providerRegistry.get(providerName);
    const items = await provider.listItems(
      {
        accessToken: integrations.accessToken,
        expiresAt: integrations.expiresAt,
        refreshToken: integrations.refreshToken,
      },
      remoteFolderId,
    );

    res.json({ items });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: error.message || 'Failed to list remote items' });
  }
};

export const startCloudImport = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorize' });
    return;
  }

  const providerName = String(req.params.provider);
  const { remoteItemId, targetFolderId } = req.body as ImportCloudItemInput;

  try {
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
      res
        .status(404)
        .json({ message: `Account is not connected to ${providerName}` });
      return;
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
  } catch (error: any) {
    res
      .status(500)
      .json({ message: error.message || 'Failed to enqueue import job' });
  }
};
