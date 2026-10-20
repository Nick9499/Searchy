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

const router = Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);
router.post('/verify-otp', validate(verifyOtpSchema), verifyUserOtp);
router.post('/resend-otp', validate(resendOtpSchema), resendOtp);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.post('/google', validate(googleAuthSchema), googleSignIn);

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, validate(updateUserSchema), updateUser);
router.delete('/me', authenticate, deleteUser);

export default router;
