import { env } from '@/config/env';
import { db } from '@/db';
import { users } from '@/db/schema';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '@/errors/app.error';
import type {
  Disable2FAInput,
  LoginInput,
  ResendOtpInput,
  ResetPasswordInput,
  SignupInput,
  UpdateUserInput,
  Verify2FAInput,
  VerifyOtpInput,
} from '@/validators/user.validator';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { createAndSendOtp, validateOtp } from './otp.service';
import { createSession, destroyAllUserSessions } from './session.service';
import type { Request } from 'express';
import { PERIODIC_VERIFICATION_DAYS } from '@/constants';
import jwt from 'jsonwebtoken';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import type { VerifyPayload } from '@/types';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const signupUser = async (input: SignupInput) => {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('Email already in use');
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);

  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      password: hashedPassword,
    })
    .returning({ id: users.id, email: users.email });

  await createAndSendOtp(input.email, 'VERIFY_EMAIL');

  return {
    message:
      'Account created. Please verify your email with the OTP sent to your inbox',
    userId: user.id,
  };
};

export const verifyUserOtp = async (input: VerifyOtpInput, req: Request) => {
  const { code, email, purpose } = input;

  const isValid = await validateOtp(email, code, purpose);
  if (!isValid) {
    throw new BadRequestError('Invalid or expired OTP');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

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
    .where(eq(users.email, email));

  return createSession(user, req);
};

export const resendUserOtp = async (input: ResendOtpInput) => {
  const { email, purpose } = input;

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    await createAndSendOtp(email, purpose);
  }

  return { message: 'Verification code resent successfully' };
};

export const loginUser = async (input: LoginInput, req: Request) => {
  const { email, password } = input;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user?.password) {
    throw new UnauthorizedError('Invalid Credentials');
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new UnauthorizedError('Invalid Credentials');
  }

  if (!user.isVerified) {
    await createAndSendOtp(email, 'VERIFY_EMAIL');
    return {
      statusCode: 403 as const,
      body: {
        message:
          'Account not verified. A new verification code has been sent to your email',
        requiresVerification: true,
      },
    };
  }

  const daysSinceLastVerification = user.lastVerifiedAt
    ? (Date.now() - new Date(user.lastVerifiedAt).getTime()) /
      (1000 * 60 * 60 * 24)
    : Number.POSITIVE_INFINITY;

  if (daysSinceLastVerification > PERIODIC_VERIFICATION_DAYS) {
    await createAndSendOtp(email, 'LOGIN_VERIFICATION');
    return {
      statusCode: 200 as const,
      body: {
        message:
          'Periodic verification required. A code has been sent to your email',
      },
    };
  }

  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign(
      { userId: user.id, is2FAPending: true },
      env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    return {
      statusCode: 200 as const,
      body: {
        requires2FA: true,
        tempToken,
        message: 'Please provide the 10 digit code from your authenticator',
      },
    };
  }

  const token = await createSession(user, req);

  return { statusCode: 200 as const, token };
};

export const forgotUserPassword = async (email: string) => {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    await createAndSendOtp(email, 'RESET_PASSWORD');
  }

  return {
    message: 'If an account exists with this email, a reset code has been sent',
  };
};

export const resetUserPassword = async (
  input: ResetPasswordInput,
  req: Request,
) => {
  const { code, email, newPassword } = input;

  const isValid = await validateOtp(email, code, 'RESET_PASSWORD');

  if (!isValid) {
    throw new BadRequestError('Invalid or expired OTP');
  }

  const [user] = await db
    .select({
      id: users.id,
      orgId: users.orgId,
      role: users.role,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await db
    .update(users)
    .set({ password: hashedPassword, updatedAt: new Date() })
    .where(eq(users.email, email));

  await destroyAllUserSessions(user.id);

  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign(
      { userId: user.id, is2FAPending: true },
      env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    return {
      requires2FA: true as const,
      tempToken,
      message:
        'Password reset successfully. Please provide your 2FA code to log in',
    };
  }

  const token = await createSession(user, req);

  return {
    requires2FA: false as const,
    token,
    message: 'Password reset successfully. You are now logged in',
  };
};

export const getUserProfile = async (userId: string) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      role: users.role,
      orgId: users.orgId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
};

export const updateUserProfile = async (
  userId: string,
  input: UpdateUserInput,
) => {
  if (input.email) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existing && existing.id !== userId) {
      throw new ConflictError('Email already in use');
    }
  }
  const [updated] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  return updated;
};

export const deleteUserAccount = async (userId: string) => {
  await db.delete(users).where(eq(users.id, userId));
  return { message: 'Account deleted' };
};

export const setupUser2FA = async (userId: string) => {
  const [user] = await db
    .select({
      email: users.email,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.twoFactorEnabled) {
    throw new BadRequestError('2FA is already enabled on your account');
  }

  const secret = generateSecret();
  const otpauth = generateURI({ secret, label: user.email, issuer: 'Searchy' });
  const qrCodeUrl = await QRCode.toDataURL(otpauth);

  await db
    .update(users)
    .set({ twoFactorSecret: secret, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return {
    secret,
    qrCodeUrl,
    message: 'Scan the QR code with your authenticator app',
  };
};

export const enableUser2FA = async (userId: string, code: string) => {
  const [user] = await db
    .select({
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorSecret: users.twoFactorSecret,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.twoFactorEnabled) {
    throw new BadRequestError('2FA is already enabled');
  }

  if (!user.twoFactorSecret) {
    throw new BadRequestError('Please initiate 2FA setup first');
  }

  const { valid } = verifySync({
    token: code,
    secret: user.twoFactorSecret,
    epochTolerance: 60,
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

  return {
    message:
      '2FA enabled successfully. Store your recovery codes in a safe place',
    recoveryCodes: rawRecoveryCodes,
  };
};

export const verifyUser2FALogin = async (
  input: Verify2FAInput,
  req: Request,
) => {
  const { code, tempToken } = input;

  let payload: VerifyPayload;

  try {
    payload = jwt.verify(tempToken, env.JWT_SECRET) as VerifyPayload;
  } catch (_) {
    throw new UnauthorizedError('Session has expired plz login again');
  }

  if (!payload.is2FAPending) {
    throw new UnauthorizedError('Invalid 2FA session token');
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new UnauthorizedError('2FA is not enabled for this user');
  }
  let verified = false;

  if (code.length === 6 && /^\d+$/.test(code)) {
    verified = verifySync({
      token: code,
      secret: user.twoFactorSecret,
      epochTolerance: 60,
    }).valid;
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
      'Invalid 2FA verification code or recovery code',
    );
  }

  return createSession(user, req);
};

export const disableUser2FA = async (
  userId: string,
  input: Disable2FAInput,
) => {
  const { code, password } = input;

  const [user] = await db
    .select({
      password: users.password,
      twoFactorEnabled: users.twoFactorEnabled,
      twoFactorSecret: users.twoFactorSecret,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('User not found');
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new BadRequestError('2FA is not enabled for this account');
  }

  if (!user.password || !(await bcrypt.compare(password, user.password))) {
    throw new UnauthorizedError('Invalid password');
  }

  const { valid } = verifySync({
    token: code,
    epochTolerance: 60,
    secret: user.twoFactorSecret,
  });

  if (!valid) {
    throw new BadRequestError('Invalid 2FA code. could not disable 2FA');
  }

  await db
    .update(users)
    .set({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { message: '2FA has been disabled successfully' };
};

export const googleSignInUser = async (idToken: string, req: Request) => {
  let payload: TokenPayload | undefined;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (_) {
    throw new UnauthorizedError('Google authentication failed');
  }

  if (!payload?.email) {
    throw new UnauthorizedError('Invalid google token payload');
  }

  const { email, name, sub: googleId } = payload;

  const userSelectFields = {
    id: users.id,
    name: users.name,
    email: users.email,
    googleId: users.googleId,
    twoFactorEnabled: users.twoFactorEnabled,
    orgId: users.orgId,
    role: users.role,
  };

  let [user] = await db
    .select(userSelectFields)
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

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
      .returning(userSelectFields);
  } else if (!user.googleId) {
    [user] = await db
      .update(users)
      .set({
        googleId,
        isVerified: true,
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning(userSelectFields);
  }

  if (user.twoFactorEnabled) {
    const tempToken = jwt.sign(
      { userId: user.id, is2FAPending: true },
      env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    return {
      requires2FA: true as const,
      tempToken,
      message: 'Please provide the 6 digit code from your authenticator app',
    };
  }

  const token = await createSession(user, req);
  return {
    requires2FA: false as const,
    token,
    user: { id: user.id, name: user.name, email: user.email },
  };
};
