import { redisConnection } from '@/config/redis';
import { db } from '@/db';
import { files, folders, userIntegrations } from '@/db/schema';
import {
  type AuthTokens,
  providerRegistry,
  type RemoteFileItem,
} from '@/integrations';
import { uploadStreamToS3 } from '@/services/storage.service';
import { Worker } from 'bullmq';
import { and, eq } from 'drizzle-orm';

export const IMPORT_QUEUE_NAME = 'cloud-import';

export interface ImportJobData {
  userId: string;
  provider: string;
  remoteItemId: string;
  targetFolderId?: string | null;
}

export const startImportWorker = () => {
  const worker = new Worker<ImportJobData>(
    IMPORT_QUEUE_NAME,
    async (job) => {
      const {
        userId,
        provider: providerName,
        remoteItemId,
        targetFolderId,
      } = job.data;
      console.log(
        `[Import Worker] Starting import job ${job.id} for user ${userId}`,
      );

      const [integration] = await db
        .select()
        .from(userIntegrations)
        .where(
          and(
            eq(userIntegrations.userId, userId),
            eq(userIntegrations.provider, providerName),
          ),
        );

      if (!integration) {
        throw new Error(`No credentials found for provider '${providerName}'`);
      }

      const tokens: AuthTokens = {
        accessToken: integration.accessToken,
        refreshToken: integration.refreshToken,
        expiresAt: integration.expiresAt,
      };

      const provider = providerRegistry.get(providerName);

      async function importItem(
        remoteId: string,
        parentFolderId: string | null = null,
      ) {
        const items = await provider.listItems(tokens, remoteId);

        if (items.length > 0 || remoteId === 'root') {
          for (const item of items) {
            if (item.isFolder) {
              const [newFolder] = await db
                .insert(folders)
                .values({
                  name: item.name,
                  userId,
                  parentId: parentFolderId,
                })
                .returning();

              await importItem(item.id, newFolder.id);
            } else {
              await importSingleFile(item, parentFolderId);
            }
          }
        } else {
          await importSingleFile(
            {
              id: remoteId,
              isFolder: false,
              name: '',
              mimeType: '',
            },
            parentFolderId,
          );
        }
      }

      async function importSingleFile(
        itemInfo: Partial<RemoteFileItem> & { id: string },
        folderId: string | null,
      ) {
        const { stream, size, mimeType, name } = await provider.getFileStream(
          tokens,
          itemInfo.id,
        );

        const fileUuid = crypto.randomUUID();
        const safeFileName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storageKey = `uploads/${userId}/${fileUuid}-${safeFileName}`;

        await uploadStreamToS3({
          key: storageKey,
          mimeType,
          stream,
        });

        await db.insert(files).values({
          name,
          mimeType,
          size: size || 0,
          storageKey,
          userId,
          folderId,
        });

        console.log(`[Import Worker] Successfully imported file: ${name}`);
      }

      await importItem(remoteItemId, targetFolderId || null);
      console.log(`[Import Worker] Import job ${job.id} completed!`);
      return { success: true };
    },
    { connection: redisConnection, concurrency: 2 },
  );

  worker.on('completed', (job) =>
    console.log(`[Import Worker] Job ${job.id} completed successfully`),
  );

  worker.on('failed', (job, err) =>
    console.log(`[Import Worker] Job ${job?.id} failed`, err),
  );

  return worker;
};
