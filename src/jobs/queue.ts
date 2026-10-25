import { Queue } from 'bullmq';
import { CLEANUP_QUEUE_NAME } from './cleanup.worker';
import { redisConnection } from '@/config/redis';
import { IMPORT_QUEUE_NAME, type ImportJobData } from './import.worker';

export const importQueue = new Queue<ImportJobData>(IMPORT_QUEUE_NAME, {
  connection: redisConnection,
});

export const cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, {
  connection: redisConnection,
});

export const scheduleTrashCleanupJob = async () => {
  await cleanupQueue.upsertJobScheduler(
    'purge-expired-trash-schedular',
    {
      pattern: '0 0 * * *',
    },
    {
      name: 'purge-expired-trash',
      opts: {
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    },
  );

  console.log('[Queue] Trash cleanup job scheduled (daily at midnight).');
};
