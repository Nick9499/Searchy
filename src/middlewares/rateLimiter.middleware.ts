import rateLimit from 'express-rate-limit';

const shouldSkip = process.env.NODE_ENV !== 'production';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => shouldSkip,
  message: {
    message:
      'Too many requests from this IP, please try again after 15 minutes',
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => shouldSkip,
  message: {
    message:
      'Too many authentication attempts. Please try again after 15 minutes.',
  },
});
