import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { otps, userIntegrations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import app from '@/app';

// Mock S3
vi.mock('@/services/storage.service', () => ({
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  uploadStreamToS3: vi.fn().mockResolvedValue(undefined),
  deleteFromS3: vi.fn().mockResolvedValue(undefined),
  getPresignedDownloadUrl: vi
    .fn()
    .mockResolvedValue('https://mock-s3.example.com/file'),
}));

// Mock Email & OTP
vi.mock('@/utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/otp', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/otp')>();
  return {
    ...original,
    generateOtp: vi.fn(() => '123456'),
  };
});

// Mock Google Provider so tests don't require real Google credentials or network access
vi.mock('@/integrations/google/google.provider', () => {
  return {
    GoogleDriveProvider: class {
      readonly name = 'google';

      getAuthUrl(state?: string) {
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&state=${state}`;
      }

      exchangeCode(_code: string) {
        return Promise.resolve({
          accessToken: 'mock_access_token_123',
          refreshToken: 'mock_refresh_token_456',
          expiresAt: new Date(Date.now() + 3600 * 1000),
        });
      }

      listItems(_tokens: unknown, remoteFolderId?: string) {
        return Promise.resolve([
          {
            id: 'mock-folder-1',
            name: 'Work Folder',
            mimeType: 'application/vnd.google-apps.folder',
            isFolder: true,
            parentId: remoteFolderId || null,
          },
          {
            id: 'mock-file-1',
            name: 'Q3_Report.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            isFolder: false,
            parentId: remoteFolderId || null,
          },
        ]);
      }

      getFileStream(_tokens: unknown, _fileId: string) {
        const { Readable } = require('node:stream');
        return Promise.resolve({
          stream: Readable.from(['mock stream data']),
          name: 'Q3_Report.pdf',
          mimeType: 'application/pdf',
          size: 1024,
        });
      }
    },
  };
});

// Mock BullMQ import queue so tests don't require Redis running
vi.mock('@/jobs/queue', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/jobs/queue')>();
  return {
    ...original,
    importQueue: {
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id-999' }),
    },
  };
});

const TEST_EMAIL = 'integration.tester@example.com';
const TEST_PASSWORD = 'Password123!';
let authToken = '';
let userId = '';

describe('Cloud Integrations API Suite', () => {
  const cleanup = async () => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, TEST_EMAIL));

    if (user) {
      await db
        .delete(userIntegrations)
        .where(eq(userIntegrations.userId, user.id));
      await db.delete(otps).where(eq(otps.email, TEST_EMAIL));
      await db.delete(users).where(eq(users.id, user.id));
    }
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Sign up user
    await request(app).post('/api/users/signup').send({
      name: 'Integration Tester',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    // 2. Resend OTP to ensure test OTP is registered
    await request(app).post('/api/users/resend-otp').send({
      email: TEST_EMAIL,
      purpose: 'VERIFY_EMAIL',
    });

    // 3. Verify OTP and capture JWT token
    const verifyRes = await request(app).post('/api/users/verify-otp').send({
      email: TEST_EMAIL,
      code: '123456',
      purpose: 'VERIFY_EMAIL',
    });

    authToken = verifyRes.body.token;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, TEST_EMAIL));
    userId = user.id;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('GET /api/integrations/:provider/auth-url', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/integrations/google/auth-url');
      expect(res.status).toBe(401);
    });

    it('should return 400 for unsupported provider', async () => {
      const res = await request(app)
        .get('/api/integrations/unsupported-cloud/auth-url')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not supported');
    });

    it('should return Google OAuth authorization URL containing userId as state', async () => {
      const res = await request(app)
        .get('/api/integrations/google/auth-url')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('authUrl');
      expect(res.body.authUrl).toContain('accounts.google.com');
      expect(res.body.authUrl).toContain(`state=${userId}`);
    });
  });

  describe('GET /api/integrations/:provider/callback', () => {
    it('should reject missing code or state parameter', async () => {
      const res = await request(app).get('/api/integrations/google/callback');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Missing authorization code');
    });

    it('should exchange code and persist integration tokens for user', async () => {
      const res = await request(app).get(
        `/api/integrations/google/callback?code=valid-auth-code&state=${userId}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Successfully connected google');

      // Verify row exists in PostgreSQL
      const [saved] = await db
        .select()
        .from(userIntegrations)
        .where(eq(userIntegrations.userId, userId));

      expect(saved).toBeDefined();
      expect(saved.provider).toBe('google');
      expect(saved.accessToken).toBe('mock_access_token_123');
      expect(saved.refreshToken).toBe('mock_refresh_token_456');
    });
  });

  describe('GET /api/integrations/:provider/files', () => {
    it('should list remote files and folders for connected provider', async () => {
      const res = await request(app)
        .get('/api/integrations/google/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(2);
      expect(res.body.items[0].name).toBe('Work Folder');
      expect(res.body.items[0].isFolder).toBe(true);
      expect(res.body.items[1].name).toBe('Q3_Report.pdf');
    });

    it('should return 400 or 404 if provider is not connected for this user', async () => {
      const res = await request(app)
        .get('/api/integrations/dropbox/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/integrations/:provider/import', () => {
    it('should validate request body and reject missing remoteItemId', async () => {
      const res = await request(app)
        .post('/api/integrations/google/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should enqueue import job and return 202 Accepted with jobId', async () => {
      const res = await request(app)
        .post('/api/integrations/google/import')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          remoteItemId: 'mock-folder-1',
          targetFolderId: null,
        });

      expect(res.status).toBe(202);
      expect(res.body.message).toBe('Import job scheduled successfully');
      expect(res.body).toHaveProperty('jobId');
      expect(res.body.jobId).toBe('mock-job-id-999');
    });
  });
});
