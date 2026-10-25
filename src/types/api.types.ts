import type z from 'zod';

export interface RequestValidationConfig {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
}

export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}
