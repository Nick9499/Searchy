import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(3000),
});

export const env = envSchema.parse(process.env);
