import express from 'express';
import userRouter from '@/routes/user.routes';
import folderRouter from '@/routes/folder.routes';
import fileRouter from '@/routes/file.routes';
import trashRouter from '@/routes/trash.routes';
import integrationRouter from '@/routes/integration.routes';
import { apiLimiter } from '@/middlewares/rateLimiter.middleware';
import { ensureBucketExists } from './services/storage.service';

const app = express();

app.use(express.json());

ensureBucketExists().catch((err) =>
  console.error('Failed to initialize S3 bucket', err),
);

app.use('/api', apiLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/users', userRouter);
app.use('/api/folders', folderRouter);
app.use('/api/files', fileRouter);
app.use('/api/trash', trashRouter);
app.use('/api/integrations', integrationRouter);

export default app;
