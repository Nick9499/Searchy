import { db } from '@/db';
import { userIntegrations, users } from '@/db/schema';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@/errors/app.error';
import { providerRegistry } from '@/integrations';
import type { IntegrationProvider } from '@/types';
import { and, eq } from 'drizzle-orm';
import { isProviderEnabledForOrg } from './organization.service';
import { isInvalidGrantError } from '@/utils/oauth';
import type { ImportCloudItemInput } from '@/validators/integration.validator';
import { importQueue } from '@/jobs/queue';

export const getProviderAuthUrl = (
  providerName: IntegrationProvider,
  userId: string,
) => {
  const provider = providerRegistry.get(providerName);
  return provider.getAuthUrl(userId);
};

export const handleProviderCallback = async (
  providerName: IntegrationProvider,
  code: string,
  userId: string,
) => {
  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.orgId) {
    const isEnable = await isProviderEnabledForOrg(user.orgId, providerName);

    if (!isEnable) {
      throw new ForbiddenError(
        `${providerName} integration is disabled for your organization. Contact your administrator`,
      );
    }
  }

  const provider = providerRegistry.get(providerName);
  const tokens = await provider.exchangeCode(code);

  const [existing] = await db
    .select({
      id: userIntegrations.id,
      refreshToken: userIntegrations.refreshToken,
    })
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, providerName),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userIntegrations)
      .set({
        accessToken: tokens.accessToken,
        provider: providerName,
        expiresAt: tokens.expiresAt,
        refreshToken: tokens.refreshToken || existing.refreshToken,
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

  return { message: `Successfully connected ${providerName}!` };
};

export const listRemoteFiles = async (
  providerName: string,
  userId: string,
  remoteFolderId?: string,
) => {
  const [integration] = await db
    .select({
      accessToken: userIntegrations.accessToken,
      refreshToken: userIntegrations.refreshToken,
      expiresAt: userIntegrations.expiresAt,
    })
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, providerName),
      ),
    )
    .limit(1);

  if (!integration) {
    throw new NotFoundError(`Account is not connected to ${providerName}`);
  }

  const provider = providerRegistry.get(providerName);

  try {
    return await provider.listItems(integration, remoteFolderId);
  } catch (error: unknown) {
    if (isInvalidGrantError(error)) {
      await db
        .delete(userIntegrations)
        .where(
          and(
            eq(userIntegrations.userId, userId),
            eq(userIntegrations.provider, providerName),
          ),
        );
    }

    throw new UnauthorizedError(
      'Google drive connection has expired or been revoked. Please reconnect your account',
    );
  }
};

export const startCloudImport = async (
  providerName: IntegrationProvider,
  userId: string,
  input: ImportCloudItemInput,
) => {
  const { remoteItemId, targetFolderId } = input;

  const [integration] = await db
    .select({ id: userIntegrations.id })
    .from(userIntegrations)
    .where(
      and(
        eq(userIntegrations.userId, userId),
        eq(userIntegrations.provider, providerName),
      ),
    )
    .limit(1);

  if (!integration) {
    throw new NotFoundError(`Account is not connected to ${providerName}`);
  }

  const { id } = await importQueue.add(`import-${providerName}-${Date.now()}`, {
    userId,
    provider: providerName,
    remoteItemId,
    targetFolderId,
  });

  return { message: 'Import job scheduled successfully', jobId: id };
};
