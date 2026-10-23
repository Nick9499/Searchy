import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { db } from '@/db';
import { users } from '@/db/schema';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import type {
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  ResendOtpInput,
  ResetPasswordInput,
  SignupInput,
  UpdateUserInput,
  VerifyOtpInput,
} from '@/validators/user.validator';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { createAndSendOtp, validateOtp } from '@/services/otp.service';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
const PERIODIC_VERIFICATION_DAYS = 30;

export const signup = async (req: Request, res: Response) => {
  const body = req.body as SignupInput;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));

  if (existing.length > 0) {
    res.status(409).json({ message: 'Email already in use' });
    return;
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
    res.status(400).json({ message: 'Invalid or expired OTP' });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  await db
    .update(users)
    .set({
      isVerified: true,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.email, user.email));

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.json({ message: 'Verification successful', token });
};

export const resendOtp = async (req: Request, res: Response) => {
  const { email, purpose } = req.body as ResendOtpInput;

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    res.json({ message: 'If the email exists, a new code has been sent' });
    return;
  }

  await createAndSendOtp(email, purpose);
  res.json({ message: 'Verification code resent successfully' });
};

export const login = async (req: Request, res: Response) => {
  const body = req.body as LoginInput;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));

  if (!user?.password) {
    res.status(401).json({ message: 'Invalid Credentials' });
    return;
  }

  const isMatch = await bcrypt.compare(body.password, user.password);

  if (!isMatch) {
    res.status(401).json({ message: 'Invalid Credentials' });
    return;
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

  const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
    expiresIn: '7d',
  });

  res.json({ token });
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
    res.status(400).json({
      message: 'Invalid or expired OTP',
    });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
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
      res.status(400).json({ message: 'Invalid google token payload' });
      return;
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

    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (_error) {
    res.status(401).json({ message: 'Google authentication failed' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
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
    res.status(401).json({ message: 'User not found' });
    return;
  }

  res.json({ user });
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const body = req.body as UpdateUserInput;

  if (body.email) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email));

    if (existing && existing.id !== req.userId) {
      res.status(409).json({ message: 'Email already in use' });
      return;
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
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  await db.delete(users).where(eq(users.id, req.userId));
  res.json({ message: 'Account deleted' });
};
