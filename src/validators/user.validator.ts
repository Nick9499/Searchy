import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be atleast 2 characters'),
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'password must be atleast 8 characters'),
});

export const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(1, 'password is required'),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(2).optional(),
    email: z.email().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    error: 'At least one field must be provided',
  });

export const verifyOtpSchema = z.object({
  email: z.email('Invalid email address'),
  code: z.string().length(6, 'OTP must be 6 digits'),
  purpose: z.enum(['VERIFY_EMAIL', 'RESET_PASSWORD', 'LOGIN_VERIFICATION']),
});

export const resendOtpSchema = z.object({
  email: z.email('Invalid email address'),
  purpose: z.enum(['VERIFY_EMAIL', 'RESET_PASSWORD', 'LOGIN_VERIFICATION']),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  email: z.email('Invalid email address'),
  code: z.string().length(6, 'OTP must be 6 digits'),
  newPassword: z.string().min(8, 'Password must be atleast 8 characters'),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
