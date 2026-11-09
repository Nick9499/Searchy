import { Router } from 'express';
import {
  deleteUser,
  disable2FA,
  enable2Fa,
  forgotPassword,
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

const router = Router();

router.post('/signup', authLimiter, validate(signupSchema), signup);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post(
  '/verify-otp',
  authLimiter,
  validate(verifyOtpSchema),
  verifyUserOtp,
);
router.post('/resend-otp', authLimiter, validate(resendOtpSchema), resendOtp);
router.post(
  '/forgot-password',
  authLimiter,
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
