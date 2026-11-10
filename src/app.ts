import express from 'express';
import userRouter from '@/routes/user.routes';
import folderRouter from '@/routes/folder.routes';
import fileRouter from '@/routes/file.routes';
import trashRouter from '@/routes/trash.routes';
import integrationRouter from '@/routes/integration.routes';
import { apiLimiter } from '@/middlewares/rateLimiter.middleware';
import { ensureBucketExists } from '@/services/storage.service';
import { errorHandler } from '@/middlewares/errorhandler.middleware';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import cors from 'cors';

const app = express();

// Trust reverse proxy (Caddy) for correct client IP and rate limiting
app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(env.FRONTEND_URL ? [env.FRONTEND_URL] : []),
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  }),
);

app.use(express.json());
app.use(cookieParser());

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

// Global Error handler must be the last middleware mounted
app.use(errorHandler);

export default app;
