import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateSync } from 'otplib';
import { db } from '@/db';
import { otps, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import app from '@/app';

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

  // ---- LOGOUT ----
  describe('POST /api/users/logout', () => {
    it('should reject logout without authentication', async () => {
      const res = await request(app).post('/api/users/logout');
      expect(res.status).toBe(401);
    });

    it('should logout user and clear cookie', async () => {
      // Create a temporary authenticated user to test logout
      const tempEmail = 'logout.test@example.com';
      await request(app).post('/api/users/signup').send({
        name: 'Logout User',
        email: tempEmail,
        password: 'Password123!',
      });
      await request(app).post('/api/users/resend-otp').send({
        email: tempEmail,
        purpose: 'VERIFY_EMAIL',
      });
      const verifyRes = await request(app).post('/api/users/verify-otp').send({
        email: tempEmail,
        code: '123456',
        purpose: 'VERIFY_EMAIL',
      });
      const tempToken = verifyRes.body.token;

      const res = await request(app)
        .post('/api/users/logout')
        .set('Authorization', `Bearer ${tempToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
      expect(res.headers['set-cookie']).toBeDefined();

      // Clean up temp user
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.email, tempEmail));
      if (u) {
        await db.delete(otps).where(eq(otps.email, tempEmail));
        await db.delete(users).where(eq(users.id, u.id));
      }
    });
  });

  // ---- LOGOUT ALL DEVICES ----
  describe('POST /api/users/logout-all', () => {
    it('should reject logout-all without authentication', async () => {
      const res = await request(app).post('/api/users/logout-all');
      expect(res.status).toBe(401);
    });

    it('should invalidate tokens across all devices', async () => {
      // 1. Create and verify a test user
      const multiDeviceEmail = 'multidevice@example.com';
      await request(app).post('/api/users/signup').send({
        name: 'Multi Device User',
        email: multiDeviceEmail,
        password: 'Password123!',
      });
      await request(app).post('/api/users/resend-otp').send({
        email: multiDeviceEmail,
        purpose: 'VERIFY_EMAIL',
      });
      const verifyRes = await request(app).post('/api/users/verify-otp').send({
        email: multiDeviceEmail,
        code: '123456',
        purpose: 'VERIFY_EMAIL',
      });
      const deviceAToken = verifyRes.body.token;

      // 2. Simulate Device B logging in
      const loginRes = await request(app).post('/api/users/login').send({
        email: multiDeviceEmail,
        password: 'Password123!',
      });
      const deviceBToken = loginRes.body.token;

      // Both tokens work
      const testA = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${deviceAToken}`);
      expect(testA.status).toBe(200);

      // 3. Device A triggers logout-all
      const logoutAllRes = await request(app)
        .post('/api/users/logout-all')
        .set('Authorization', `Bearer ${deviceAToken}`);
      expect(logoutAllRes.status).toBe(200);
      expect(logoutAllRes.body.message).toBe(
        'Logged out of all devices successfully',
      );

      // 4. Device B is now rejected because tokenVersion is outdated
      const testB = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${deviceBToken}`);
      expect(testB.status).toBe(401);

      // Clean up
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.email, multiDeviceEmail));
      if (u) {
        await db.delete(otps).where(eq(otps.email, multiDeviceEmail));
        await db.delete(users).where(eq(users.id, u.id));
      }
    });
  });

  // ---- TWO-FACTOR AUTHENTICATION (2FA) LIFECYCLE ----
  describe('2FA Lifecycle', () => {
    const twoFaEmail = 'twofa.user@example.com';
    let userToken: string;
    let totpSecret: string;
    let recoveryCodes: string[] = [];

    beforeAll(async () => {
      await request(app).post('/api/users/signup').send({
        name: '2FA User',
        email: twoFaEmail,
        password: 'Password123!',
      });
      await request(app).post('/api/users/resend-otp').send({
        email: twoFaEmail,
        purpose: 'VERIFY_EMAIL',
      });
      const verifyRes = await request(app).post('/api/users/verify-otp').send({
        email: twoFaEmail,
        code: '123456',
        purpose: 'VERIFY_EMAIL',
      });
      userToken = verifyRes.body.token;
    });

    afterAll(async () => {
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.email, twoFaEmail));
      if (u) {
        await db.delete(otps).where(eq(otps.email, twoFaEmail));
        await db.delete(users).where(eq(users.id, u.id));
      }
    });

    it('POST /api/users/2fa/setup - should generate TOTP secret and QR Code', async () => {
      const res = await request(app)
        .post('/api/users/2fa/setup')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.secret).toBeDefined();
      expect(res.body.qrCodeUrl).toContain('data:image/png;base64');
      totpSecret = res.body.secret;
    });

    it('POST /api/users/2fa/enable - should reject invalid code', async () => {
      const res = await request(app)
        .post('/api/users/2fa/enable')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid 2FA code');
    });

    it('POST /api/users/2fa/enable - should enable 2FA with valid code and return recovery codes', async () => {
      const validCode = generateSync({ secret: totpSecret });

      const res = await request(app)
        .post('/api/users/2fa/enable')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: validCode });

      expect(res.status).toBe(200);
      expect(res.body.recoveryCodes).toHaveLength(8);
      recoveryCodes = res.body.recoveryCodes;
    });

    it('POST /api/users/login - should require 2FA and return tempToken', async () => {
      const res = await request(app).post('/api/users/login').send({
        email: twoFaEmail,
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.requires2FA).toBe(true);
      expect(res.body.tempToken).toBeDefined();
    });

    it('POST /api/users/2fa/verify - should complete login with valid 6-digit TOTP code', async () => {
      const loginRes = await request(app).post('/api/users/login').send({
        email: twoFaEmail,
        password: 'Password123!',
      });
      const tempToken = loginRes.body.tempToken;
      const validCode = generateSync({ secret: totpSecret });

      const res = await request(app).post('/api/users/2fa/verify').send({
        tempToken,
        code: validCode,
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('POST /api/users/2fa/verify - should complete login with backup recovery code', async () => {
      const loginRes = await request(app).post('/api/users/login').send({
        email: twoFaEmail,
        password: 'Password123!',
      });
      const tempToken = loginRes.body.tempToken;
      const backupCode = recoveryCodes[0];

      const res = await request(app).post('/api/users/2fa/verify').send({
        tempToken,
        code: backupCode,
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();

      // Trying the same used recovery code again should fail
      const loginRes2 = await request(app).post('/api/users/login').send({
        email: twoFaEmail,
        password: 'Password123!',
      });
      const reuseRes = await request(app).post('/api/users/2fa/verify').send({
        tempToken: loginRes2.body.tempToken,
        code: backupCode,
      });
      expect(reuseRes.status).toBe(401);
    });

    it('POST /api/users/2fa/disable - should disable 2FA with password and code', async () => {
      const validCode = generateSync({ secret: totpSecret });

      const res = await request(app)
        .post('/api/users/2fa/disable')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          password: 'Password123!',
          code: validCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('2FA has been disabled successfully');

      // Next login should not require 2FA
      const loginRes = await request(app).post('/api/users/login').send({
        email: twoFaEmail,
        password: 'Password123!',
      });
      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.requires2FA).toBeUndefined();
    });
  });
});
