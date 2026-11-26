import { env } from '@/config/env';
import type {
  Disable2FAInput,
  Enable2FAInput,
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  ResendOtpInput,
  ResetPasswordInput,
  RevokeSessionInput,
  SignupInput,
  UpdateUserInput,
  Verify2FAInput,
  VerifyOtpInput,
} from '@/validators/user.validator';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '@/errors/app.error';
import type { AuthRequest } from '@/types';
import {
  AUTH_COOKIE_NAME,
  CLEAR_COOKIE_OPTIONS,
  COOKIE_OPTIONS,
} from '@/constants';
import {
  destroyAllUserSessions,
  destroySession,
  getUserSessions,
  revokeUserSession,
} from '@/services/session.service';
import * as userService from '@/services/user.service';

const _googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const signup = async (
  req: Request<Record<string, never>, unknown, SignupInput>,
  res: Response,
) => {
  const result = await userService.signupUser(req.body);
  res.status(201).json(result);
};

export const verifyUserOtp = async (
  req: Request<Record<string, never>, unknown, VerifyOtpInput>,
  res: Response,
) => {
  const token = await userService.verifyUserOtp(req.body, req);

  res
    .cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS)
    .json({ message: 'Verification successful', token });
};

export const resendOtp = async (
  req: Request<Record<string, never>, unknown, ResendOtpInput>,
  res: Response,
) => {
  const result = await userService.resendUserOtp(req.body);
  res.json(result);
};

export const login = async (
  req: Request<Record<string, never>, unknown, LoginInput>,
  res: Response,
) => {
  const result = await userService.loginUser(req.body, req);

  if ('body' in result) {
    res.status(result.statusCode).json(result.body);
    return;
  }

  res
    .cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    .json({ token: result.token });
};

export const forgotPassword = async (
  req: Request<Record<string, never>, unknown, ForgotPasswordInput>,
  res: Response,
) => {
  const result = await userService.forgotUserPassword(req.body.email);
  res.json(result);
};

export const resetPassword = async (
  req: Request<Record<string, never>, unknown, ResetPasswordInput>,
  res: Response,
) => {
  const result = await userService.resetUserPassword(req.body, req);

  if (result.requires2FA) {
    res.json(result);
    return;
  }

  res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS).json(result);
};

export const googleSignIn = async (
  req: Request<Record<string, never>, unknown, GoogleAuthInput>,
  res: Response,
) => {
  const result = await userService.googleSignInUser(req.body.idToken, req);

  if (result.requires2FA) {
    res.json(result);
    return;
  }

  res
    .cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    .json({ token: result.token, user: result.user });
};

export const getMe = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const user = await userService.getUserProfile(req.userId);

  res.json({ user });
};

export const updateUser = async (
  req: AuthRequest<Record<string, never>, unknown, UpdateUserInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const user = await userService.updateUserProfile(req.userId, req.body);
  res.json({ user });
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await userService.deleteUserAccount(req.userId);
  res.json(result);
};

export const logout = async (req: AuthRequest, res: Response) => {
  const token =
    req.sessionId ||
    req.cookies.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization?.split(' ')[1]
      : null);

  if (token) {
    await destroySession(token, req.userId);
  }

  res.clearCookie(AUTH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

  res.json({ message: 'Logged out successfully' });
};

export const logoutAll = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new UnauthorizedError('Unauthorized');
  }

  await destroyAllUserSessions(userId);

  res.clearCookie(AUTH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS).json({
    message: 'Logged out of all devices successfully',
  });
};

export const setup2FA = async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new UnauthorizedError('Unauthorize');
  }

  const result = await userService.setupUser2FA(userId);
  res.json(result);
};

export const enable2Fa = async (
  req: AuthRequest<Record<string, never>, unknown, Enable2FAInput>,
  res: Response,
) => {
  const userId = req.userId;

  if (!userId) throw new UnauthorizedError('Unauthorize');

  const result = await userService.enableUser2FA(userId, req.body.code);
  res.json(result);
};

export const verify2FALogin = async (
  req: AuthRequest<Record<string, never>, unknown, Verify2FAInput>,
  res: Response,
) => {
  const token = await userService.verifyUser2FALogin(req.body, req);
  res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS).json({
    token,
    message: '2FA authenticated successfully',
  });
};

export const disable2FA = async (
  req: AuthRequest<Record<string, never>, unknown, Disable2FAInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError('Unauthorize');
  }

  const result = await userService.disableUser2FA(req.userId, req.body);
  res.json(result);
};

export const listSessions = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const sessions = await getUserSessions(req.userId, req.sessionId);
  res.json({ sessions });
};

export const revokeSession = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const { sessionId } = req.params as RevokeSessionInput;

  if (!sessionId) {
    throw new BadRequestError('Session ID is required');
  }

  const revoked = await revokeUserSession(req.userId, sessionId);
  if (!revoked) {
    throw new NotFoundError('Session not found');
  }

  res.json({ message: 'Session revoked successfully' });
};
