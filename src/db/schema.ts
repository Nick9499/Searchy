import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const otpPurposeEnum = pgEnum('otp_purpose', [
  'VERIFY_EMAIL',
  'RESET_PASSWORD',
  'LOGIN_VERIFICATION',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password'),
  googleId: text('google_id').unique(),
  isVerified: boolean('is_verified').notNull().default(false),
  lastVerifiedAt: timestamp('last_verified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const otps = pgTable('otps', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  code: text('code').notNull(),
  purpose: otpPurposeEnum('purpose').notNull(),
  expiresAt: timestamp('expired_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
