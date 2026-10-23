import { redisConnection } from '@/config/redis';
import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { deleteFromS3 } from '@/services/storage.service';
import { Worker } from 'bullmq';
import { and, isNotNull, lte } from 'drizzle-orm';

export const CLEANUP_QUEUE_NAME = 'trash-cleanup';

export const startCleanupWork = () => {
  const worker = new Worker(
    CLEANUP_QUEUE_NAME,
    async (job) => {
      console.log(`[Worker] Starting job: ${job.name} (id: ${job.id})`);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const expiredFiles = await db
        .select()
        .from(files)
        .where(
          and(isNotNull(files.deletedAt), lte(files.deletedAt, thirtyDaysAgo)),
        );

      console.log(
        `[Worker] Found ${expiredFiles.length} expired files to purge`,
      );

      for (const file of expiredFiles) {
        try {
          await deleteFromS3(file.storageKey);
        } catch (error) {
          console.error(
            `[Worker] Failed to delete S3 file: ${file.storageKey}`,
            error,
          );
        }
      }

      if (expiredFiles.length > 0) {
        await db
          .delete(files)
          .where(
            and(
              isNotNull(files.deletedAt),
              lte(files.deletedAt, thirtyDaysAgo),
            ),
          );
      }

      const deletedFoldersResult = await db
        .delete(folders)
        .where(
          and(
            isNotNull(folders.deletedAt),
            lte(folders.deletedAt, thirtyDaysAgo),
          ),
        )
        .returning({ id: folders.id });

      console.log(
        `[Worker] Purge complete. Deleted ${expiredFiles.length} files and ${deletedFoldersResult.length} folders`,
      );

      return {
        purgedFiles: expiredFiles.length,
        purgedFolders: deletedFoldersResult.length,
      };
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) =>
    console.log(`[Worker] Job ${job.id} completed successfully.`),
  );

  worker.on('failed', (job, err) => {
    console.log(`[Worked] Job ${job?.id} failed`, err);
  });

  return worker;
};
