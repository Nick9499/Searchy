import express from 'express';
import userRouter from '@/routes/user.routes';
import { apiLimiter } from '@/middlewares/rateLimiter.middleware';

const app = express();

app.use(express.json());

app.use('/api', apiLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/users', userRouter);

export default app;
