import { Router } from 'express';
import {
  deleteUser,
  disable2FA,
  enable2Fa,
  forgotPassword,
  getHandshake,
  getMe,
  googleSignIn,
  listSessions,
  login,
  logout,
  logoutAll,
  resendOtp,
  resetPassword,
  revokeSession,
  setup2FA,
  signup,
  updateUser,
  verify2FALogin,
  verifyUserOtp,
} from '@/controllers/user.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  disable2FASchema,
  enable2FASchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  resendOtpSchema,
  resetPasswordSchema,
  revokeSessionSchema,
  signupSchema,
  updateUserSchema,
  verify2FASchema,
  verifyOtpSchema,
} from '@/validators/user.validator';
import { authLimiter } from '@/middlewares/rateLimiter.middleware';
import { verifyBotProtection } from '@/middlewares/botProtection.middleware';

const router = Router();

router.get('/handshake', getHandshake);

router.post(
  '/signup',
  authLimiter,
  verifyBotProtection,
  validate(signupSchema),
  signup,
);
router.post(
  '/login',
  authLimiter,
  verifyBotProtection,
  validate(loginSchema),
  login,
);
router.post(
  '/verify-otp',
  authLimiter,
  verifyBotProtection,
  validate(verifyOtpSchema),
  verifyUserOtp,
);
router.post(
  '/resend-otp',
  authLimiter,
  verifyBotProtection,
  validate(resendOtpSchema),
  resendOtp,
);
router.post(
  '/forgot-password',
  authLimiter,
  verifyBotProtection,
  validate(forgotPasswordSchema),
  forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  resetPassword,
);
router.post('/google', authLimiter, validate(googleAuthSchema), googleSignIn);

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, validate(updateUserSchema), updateUser);
router.delete('/me', authenticate, deleteUser);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);

router.post(
  '/2fa/verify',
  authLimiter,
  validate(verify2FASchema),
  verify2FALogin,
);

router.post('/2fa/setup', authenticate, setup2FA);
router.post('/2fa/enable', authenticate, validate(enable2FASchema), enable2Fa);
router.post(
  '/2fa/disable',
  authenticate,
  validate(disable2FASchema),
  disable2FA,
);

router.get('/sessions', authenticate, listSessions);
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validate(revokeSessionSchema),
  revokeSession,
);

export default router;
