import type z from 'zod';

export type HttpHeaderName =
  | 'user-agent'
  | 'x-forwarded-for'
  | 'authorization'
  | 'content-type'
  | 'cookie'
  | 'accept'
  | 'origin'
  | 'referer'
  | 'host'
  | 'x-request-id'
  | (string & {});

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
