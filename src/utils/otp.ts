import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const generateOtp = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const hashOtp = async (otp: string): Promise<string> => {
  return bcrypt.hash(otp, 10);
};

export const verifyOtp = async (
  otp: string,
  hashedOtp: string,
): Promise<boolean> => {
  return bcrypt.compare(otp, hashedOtp);
};
