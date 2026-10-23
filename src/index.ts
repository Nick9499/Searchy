import app from './app';
import { env } from './config/env';
import { startCleanupWork } from './jobs/cleanup.worker';
import { scheduleTrashCleanupJob } from './jobs/queue';

app.listen(env.PORT, async () => {
  console.log(`Server running on port ${env.PORT}`);

  if (process.env.NODE_ENV !== 'test') {
    startCleanupWork();
    await scheduleTrashCleanupJob();
  }
});
