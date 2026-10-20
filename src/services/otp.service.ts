import { db } from '@/db';
import { otps } from '@/db/schema';
import { sendEmail } from '@/utils/email';
import { generateOtp, hashOtp, verifyOtp } from '@/utils/otp';
import { and, eq, gt } from 'drizzle-orm';

export type OtpPurpose = typeof otps.$inferInsert.purpose;
const OTP_EXPIRY_MINUTES = 10;

export const createAndSendOtp = async (email: string, purpose: OtpPurpose) => {
  const plainOtp = generateOtp();
  const hashedOtp = await hashOtp(plainOtp);

  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing unused otp for this email and purpose
  await db
    .delete(otps)
    .where(and(eq(otps.email, email), eq(otps.purpose, purpose)));

  await db.insert(otps).values({
    email,
    code: hashedOtp,
    purpose,
    expiresAt,
  });

  // Prepare email content based on purpose
  let subject = 'Your Verification Code';
  if (purpose === 'VERIFY_EMAIL') {
    subject = 'Verify Your Searchy Account';
  } else if (purpose === 'RESET_PASSWORD') {
    subject = 'Reset Your Password';
  } else if (purpose === 'LOGIN_VERIFICATION') {
    subject = 'Login Verification Code';
  }

  const message = `Your one-time verification code is: ${plainOtp}\nThis code is valid for ${OTP_EXPIRY_MINUTES}
  minutes. If you did not request this, please ignore this email.`;

  await sendEmail({
    to: email,
    subject,
    text: message,
  });
};

export const validateOtp = async (
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<boolean> => {
  const [record] = await db
    .select()
    .from(otps)
    .where(
      and(
        eq(otps.email, email),
        eq(otps.purpose, purpose),
        gt(otps.expiresAt, new Date()),
      ),
    );

  if (!record) return false;

  const isValid = await verifyOtp(code, record.code);

  if (!isValid) return false;

  await db.delete(otps).where(eq(otps.id, record.id));
  return true;
};
