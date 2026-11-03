import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { db } from '@/db';
import { users } from '@/db/schema';
import type {
  Disable2FAInput,
  Enable2FAInput,
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  ResendOtpInput,
  ResetPasswordInput,
  SignupInput,
  UpdateUserInput,
  Verify2FAInput,
  VerifyOtpInput,
} from '@/validators/user.validator';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { createAndSendOtp, validateOtp } from '@/services/otp.service';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '@/errors/app.error';
import type { AuthRequest } from '@/types';
import { redisClient } from '@/config/redis';
import {
  AUTH_COOKIE_NAME,
  CLEAR_COOKIE_OPTIONS,
  COOKIE_OPTIONS,
  PERIODIC_VERIFICATION_DAYS,
} from '@/constants';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'node:crypto';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const signup = async (req: Request, res: Response) => {
  const body = req.body as SignupInput;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));

  if (existing.length > 0) {
    throw new ConflictError('Email already in use');
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);

  const [user] = await db
    .insert(users)
    .values({
      name: body.name,
      email: body.email,
      password: hashedPassword,
    })
    .returning();

  await createAndSendOtp(user.email, 'VERIFY_EMAIL');

  res.status(201).json({
    message:
      'Account created. Please verify your email with the OTP sent to your inbox.',
    userId: user.id,
  });
};

export const verifyUserOtp = async (req: Request, res: Response) => {
  const { email, code, purpose } = req.body as VerifyOtpInput;

  const isValid = await validateOtp(email, code, purpose);

  if (!isValid) {
    throw new BadRequestError('Invalid or expired OTP');
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    throw new BadRequestError('User not found');
  }

  await db
    .update(users)
    .set({
      isVerified: true,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.email, user.email));

  const token = jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion ?? 0 },
    env.JWT_SECRET,
    {
      expiresIn: '7d',
      jwtid: crypto.randomUUID(),
    },
  );
  res
    .cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS)
    .json({ message: 'Verification successful', token });
};

export const resendOtp = async (req: Request, res: Response) => {
  const { email, purpose } = req.body as ResendOtpInput;

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (user) {
    await createAndSendOtp(email, purpose);
  }
  res.json({ message: 'Verification code resent successfully' });
};

export const login = async (req: Request, res: Response) => {
  const body = req.body as LoginInput;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));

  if (!user?.password) {
    throw new UnauthorizedError('Invalid Credentials');
  }

  const isMatch = await bcrypt.compare(body.password, user.password);

  if (!isMatch) {
    throw new UnauthorizedError('Invalid Credentials');
  }

  if (!user.isVerified) {
    await createAndSendOtp(user.email, 'VERIFY_EMAIL');
    res.status(403).json({
      message:
        'Account not verified. A new verification code has been sent to your email',
      requiresVerification: true,
    });
    return;
  }

  // Check periodic verification (every 30 days)
  const daysSinceLastVerification = user.lastVerifiedAt
    ? (Date.now() - new Date(user.lastVerifiedAt).getTime()) /
      (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;

  if (daysSinceLastVerification > PERIODIC_VERIFICATION_DAYS) {
    await createAndSendOtp(user.email, 'LOGIN_VERIFICATION');
    res.status(200).json({
      message:
        'Periodic verification required. A code has been sent to your email',
    });
    return;
  }

  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign(
      { userId: user.id, is2FAPending: true },
      env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    res.json({
      requires2FA: true,
      tempToken,
      message: 'Please provide the 6 digit code from your authenticator app',
    });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, tokenVersion: user.tokenVersion ?? 0 },
    env.JWT_SECRET,
    {
      expiresIn: '7d',
      jwtid: crypto.randomUUID(),
    },
  );

  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS).json({ token });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordInput;

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (user) {
    await createAndSendOtp(email, 'RESET_PASSWORD');
  }

  res.json({
    message: 'If an account exists with this email, a reset code has been sent',
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body as ResetPasswordInput;

  const isValid = await validateOtp(email, code, 'RESET_PASSWORD');

  if (!isValid) {
    throw new BadRequestError('Invalid or expired OTP');
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await db
    .update(users)
    .set({
      password: hashedPassword,
      updatedAt: new Date(),
    })
    .where(eq(users.email, email));

  res.json({
    message:
      'Password reset successfully. You can now login with your new password',
  });
};

export const googleSignIn = async (req: Request, res: Response) => {
  const { idToken } = req.body as GoogleAuthInput;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new UnauthorizedError('Invalid google token payload');
    }

    const { email, name, sub: googleId } = payload;

    let [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          name: name || 'Google user',
          email,
          googleId,
          isVerified: true,
          lastVerifiedAt: new Date(),
        })
        .returning();
    } else if (!user.googleId) {
      [user] = await db.update(users).set({
        googleId,
        isVerified: true,
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const token = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion ?? 0 },
      env.JWT_SECRET,
      {
        expiresIn: '7d',
        jwtid: crypto.randomUUID(),
      },
    );
    res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (_error) {
    throw new UnauthorizedError('Google authentication failed');
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.userId));

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({ user });
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const body = req.body as UpdateUserInput;

  if (body.email) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email));

    if (existing && existing.id !== req.userId) {
      throw new ConflictError('Email already in use');
    }
  }

  const [updated] = await db
    .update(users)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(users.id, req.userId))
    .returning();

  res.json({ user: updated });
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  await db.delete(users).where(eq(users.id, req.userId));
  res.json({ message: 'Account deleted' });
};

export const logout = async (req: AuthRequest, res: Response) => {
  const token =
    req.cookies.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization?.split(' ')[1]
      : null);

  if (token && env.NODE_ENV !== 'test') {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (decoded?.exp) {
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = decoded.exp - now;

      if (remainingSeconds > 0) {
        await redisClient.setex(
          `blacklist:${token}`,
          remainingSeconds,
          'revoked',
        );
      }
    }
  }

  res.clearCookie(AUTH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

  res.json({ message: 'Logged out successfully' });
};

export const logoutAll = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  const [updatedUser] = await db
    .update(users)
    .set({ tokenVersion: sql`${users.tokenVersion}+1`, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ tokenVersion: users.tokenVersion });

  if (redisClient.status === 'ready') {
    await redisClient.set(
      `user_token_version:${userId}`,
      String(updatedUser?.tokenVersion ?? 1),
      'EX',
      3600,
    );
  }

  res.clearCookie(AUTH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS).json({
    message: 'Logged out of all devices successfully',
  });
};

export const setup2FA = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new UnauthorizedError('Unauthorize');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.twoFactorEnabled) {
    throw new BadRequestError('2FA is already enabled on your account');
  }

  const secret = generateSecret();
  const otpauth = generateURI({
    secret,
    label: user.email,
    issuer: 'Searchy',
  });
  const qrCodeUrl = await QRCode.toDataURL(otpauth);

  await db
    .update(users)
    .set({ twoFactorSecret: secret, updatedAt: new Date() })
    .where(eq(users.id, userId));

  res.json({
    secret,
    qrCodeUrl,
    message:
      'Scan the QR code with Google Authenticator, Microsoft Authenticator, or 1Password',
  });
};

export const enable2Fa = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { code } = req.body as Enable2FAInput;

  if (!userId) throw new UnauthorizedError('Unauthorize');

  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) throw new NotFoundError('User not found');
  if (user.twoFactorEnabled)
    throw new BadRequestError('2Fa is alreayd enabled');
  if (!user.twoFactorSecret)
    throw new BadRequestError('Please initiate 2FA setup first');

  const { valid } = verifySync({
    token: code,
    secret: user.twoFactorSecret,
  });

  if (!valid) {
    throw new BadRequestError('Invalid 2FA code. Please try again');
  }

  const rawRecoveryCodes: string[] = [];
  const hashedRecoveryCodes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const rawCode = crypto.randomBytes(5).toString('hex');
    rawRecoveryCodes.push(rawCode);
    hashedRecoveryCodes.push(await bcrypt.hash(rawCode, 10));
  }

  await db
    .update(users)
    .set({
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: JSON.stringify(hashedRecoveryCodes),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  res.json({
    message:
      '2FA enabled successfully. Store your recovery codes in a safe place',
    recoveryCodes: rawRecoveryCodes,
  });
};

export const verify2FALogin = async (req: AuthRequest, res: Response) => {
  const { code, tempToken } = req.body as Verify2FAInput;

  let payload: { userId: string; is2FAPending?: boolean };
  try {
    payload = jwt.verify(tempToken, env.JWT_SECRET) as {
      userId: string;
      is2FAPending: boolean;
    };
  } catch {
    throw new UnauthorizedError('Session has expired. Please login again');
  }

  if (!payload.is2FAPending) {
    throw new UnauthorizedError('Invalid 2FA session token');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId));

  if (!user?.twoFactorEnabled || !user?.twoFactorSecret)
    throw new UnauthorizedError('2FA is not enabled for this user');

  let verified = false;

  if (code.length === 6 && /^\d+$/.test(code)) {
    verified = verifySync({ token: code, secret: user.twoFactorSecret }).valid;
  }

  if (!verified && user.twoFactorRecoveryCodes) {
    const hashedCodes: string[] = JSON.parse(user.twoFactorRecoveryCodes);
    let matchIndex = -1;

    for (let i = 0; i < hashedCodes.length; i++) {
      if (await bcrypt.compare(code, hashedCodes[i])) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex !== -1) {
      verified = true;
      hashedCodes.splice(matchIndex, 1);

      await db
        .update(users)
        .set({
          twoFactorRecoveryCodes: JSON.stringify(hashedCodes),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }
  }

  if (!verified) {
    throw new UnauthorizedError(
      'Invalid 2FA verfication code or recovery code',
    );
  }

  const token = jwt.sign(
    {
      userId: user.id,
      tokenVersion: user.tokenVersion ?? 0,
    },
    env.JWT_SECRET,
    { expiresIn: '7d', jwtid: crypto.randomUUID() },
  );

  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS).json({
    token,
    message: '2FA authenticated successfully',
  });
};

export const disable2FA = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { code, password } = req.body as Disable2FAInput;

  if (!userId) throw new UnauthorizedError('Unauthorize');
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new NotFoundError('User not found');
  if (!user.twoFactorEnabled || !user.twoFactorSecret)
    throw new BadRequestError('2FA is not enabled on this account');

  if (!user.password || !(await bcrypt.compare(password, user.password))) {
    throw new UnauthorizedError('Invalid password');
  }

  const { valid } = verifySync({
    token: code,
    secret: user.twoFactorSecret,
  });

  if (!valid)
    throw new BadRequestError('Invalid 2FA code. could not disable 2FA');

  await db
    .update(users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  res.json({ message: '2FA has been disabled successfully' });
};
