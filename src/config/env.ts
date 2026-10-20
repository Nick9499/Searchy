import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  // Email config (optional with defaults)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Searchy <no-reply@searchy.local>'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  // S3 / Object Storage config
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('test'),
  S3_SECRET_KEY: z.string().default('test'),
  S3_BUCKET_NAME: z.string().default('searchy-files'),
});

export const env = envSchema.parse(process.env);
