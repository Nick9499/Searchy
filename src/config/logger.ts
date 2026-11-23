import pino, { type TransportSingleOptions } from 'pino';
import { env } from './env';

const isProduction = env.NODE_ENV === 'production';
const hasLokiConfig = (): boolean => Boolean(env.LOKI_HOST);
const hasLokiAuth = (): boolean => Boolean(env.LOKI_USER && env.LOKI_PASSWORD);

const getTransport = (): TransportSingleOptions | undefined => {
  // 1. In non-prod envirorment, use pretty printing
  if (!isProduction) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  // 2. In prod with Loki config, ship logs to Grafana Loki
  if (hasLokiConfig()) {
    const basicAuth = hasLokiAuth()
      ? {
          username: env.LOKI_USER,
          password: env.LOKI_PASSWORD,
        }
      : undefined;

    return {
      target: 'pino-loki',
      options: {
        batching: true,
        interval: 5, // send batches every 5s
        host: env.LOKI_HOST,
        basicAuth,
        labels: {
          app: 'searchy',
          env: env.NODE_ENV,
        },
      },
    };
  }

  // 3. Fallback: Standard stdout JSON loggin (native docker logs)
  return undefined;
};

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: getTransport(),
});
