import { pinoHttp } from 'pino-http';
import { logger } from '@/config/logger';
import { randomUUID } from 'node:crypto';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existingId = req.headers['x-request-id'];
    const id = typeof existingId === 'string' ? existingId : randomUUID();
    res.setHeader('x-request-id', id);

    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} -> ${res.statusCode}`,
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
});
