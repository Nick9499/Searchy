import { Router } from 'express';
import {
  deleteUser,
  forgotPassword,
  getMe,
  googleSignIn,
  login,
  resendOtp,
  resetPassword,
  signup,
  updateUser,
  verifyUserOtp,
} from '@/controllers/user.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  resendOtpSchema,
  resetPasswordSchema,
  signupSchema,
  updateUserSchema,
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

export default router;
