import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { otps, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import app from '@/app';

vi.mock('@/utils/otp', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/otp')>();
  return {
    ...original,
    generateOtp: vi.fn(() => '123456'),
  };
});

// --- Mock Google auth library ---
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken() {
      return Promise.resolve({
        getPayload: () => ({
          email: 'google@example.com',
          name: 'Google User',
          sub: 'google-uid-12345',
        }),
      });
    }
  },
}));

// --- Test constants ---
const TEST_EMAIL = 'auth.test@example.com';
const TEST_PASSWORD = 'password123';
const TEST_NAME = 'Auth Test User';
const TEST_OTP = '123456';

// --- Shared state between tests ---
let authToken = '';
let _userId = '';

describe('User Auth & Account Management', () => {
  const cleanup = async () => {
    const testEmails = [TEST_EMAIL, 'google@example.com'];
    for (const email of testEmails) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (user) {
        await db.delete(otps).where(eq(otps.email, email));
        await db.delete(users).where(eq(users.id, user.id));
      }
    }
  };

  beforeAll(async () => await cleanup());
  afterAll(async () => await cleanup());

  // ---- SIGNUP ----
  describe('POST /api/users/signup', () => {
    it('should create a new user and send OTP (201)', async () => {
      const res = await request(app)
        .post('/api/users/signup')
        .send({ name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('userId');
      expect(res.body.message).toContain('verify your email');
      _userId = res.body.userId;
    });

    it('should reject duplicate email (409)', async () => {
      const res = await request(app)
        .post('/api/users/signup')
        .send({ name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Email already in use');
    });
  });

  // ---- LOGIN (unverified) ----
  describe('POST /api/users/login - unverified account', () => {
    it('should block login and resend OTP for unverified account (403)', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.requiresVerification).toBe(true);
    });

    it('should reject wrong password (401)', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({ email: TEST_EMAIL, password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });
  });

  // ---- VERIFY OTP ----
  describe('POST /api/users/verify-otp', () => {
    it('should reject invalid OTP (400)', async () => {
      const res = await request(app)
        .post('/api/users/verify-otp')
        .send({ email: TEST_EMAIL, code: '000000', purpose: 'VERIFY_EMAIL' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid or expired OTP');
    });

    it('should verify email with correct OTP and return JWT (200)', async () => {
      await request(app)
        .post('/api/users/resend-otp')
        .send({ email: TEST_EMAIL, purpose: 'VERIFY_EMAIL' });

      const res = await request(app)
        .post('/api/users/verify-otp')
        .send({ email: TEST_EMAIL, code: TEST_OTP, purpose: 'VERIFY_EMAIL' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.message).toBe('Verification successful');
      authToken = res.body.token;
    });
  });

  // ---- RESEND OTP ----
  describe('POST /api/users/resend-otp', () => {
    it('should resend OTP for existing user (200)', async () => {
      const res = await request(app)
        .post('/api/users/resend-otp')
        .send({ email: TEST_EMAIL, purpose: 'VERIFY_EMAIL' });

      expect(res.status).toBe(200);
    });

    it('should return 200 even for unknown email (security)', async () => {
      const res = await request(app)
        .post('/api/users/resend-otp')
        .send({ email: 'nobody@example.com', purpose: 'VERIFY_EMAIL' });

      expect(res.status).toBe(200);
    });
  });

  // ---- LOGIN (verified) ----
  describe('POST /api/users/login - verified account', () => {
    it('should login successfully and return JWT (200)', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      authToken = res.body.token;
    });

    it('should reject invalid credentials (401)', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({ email: TEST_EMAIL, password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });
  });

  // ---- FORGOT PASSWORD ----
  describe('POST /api/users/forgot-password', () => {
    it('should always return 200 regardless of email existence (security)', async () => {
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: 'doesnotexist@example.com' });

      expect(res.status).toBe(200);
    });

    it('should send reset OTP for existing user (200)', async () => {
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: TEST_EMAIL });

      expect(res.status).toBe(200);
    });
  });

  // ---- RESET PASSWORD ----
  describe('POST /api/users/reset-password', () => {
    it('should reject invalid reset OTP (400)', async () => {
      const res = await request(app)
        .post('/api/users/reset-password')
        .send({ email: TEST_EMAIL, code: '000000', newPassword: 'newpass123' });

      expect(res.status).toBe(400);
    });

    it('should reset password with valid OTP (200)', async () => {
      await request(app)
        .post('/api/users/forgot-password')
        .send({ email: TEST_EMAIL });

      const res = await request(app)
        .post('/api/users/reset-password')
        .send({ email: TEST_EMAIL, code: TEST_OTP, newPassword: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password reset successfully');
    });

    it('should login with new password after reset (200)', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({ email: TEST_EMAIL, password: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      authToken = res.body.token;
    });
  });

  // ---- GOOGLE SIGN IN ----
  describe('POST /api/users/google', () => {
    it('should create a new Google user and return JWT (200)', async () => {
      const res = await request(app)
        .post('/api/users/google')
        .send({ idToken: 'mock-google-token' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.email).toBe('google@example.com');
    });

    it('should return JWT for existing Google user without duplicate (200)', async () => {
      const res = await request(app)
        .post('/api/users/google')
        .send({ idToken: 'mock-google-token' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');

      const found = await db
        .select()
        .from(users)
        .where(eq(users.email, 'google@example.com'));

      expect(found.length).toBe(1);
    });
  });

  // ---- AUTHENTICATED ROUTES ----
  describe('GET /api/users/me', () => {
    it('should return authenticated user profile (200)', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ email: TEST_EMAIL });
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should reject request without token (401)', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/me', () => {
    it('should update user name (200)', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
    });

    it('should reject empty update body (400)', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/users/me', () => {
    it('should delete authenticated user account (200)', async () => {
      const res = await request(app)
        .delete('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Account deleted');
    });
  });
});
