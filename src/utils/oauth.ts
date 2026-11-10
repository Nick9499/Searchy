import type { OAuthErrorResponse } from '@/types';

export const isInvalidGrantError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) {
    return false;
  }

  const errorObj = err as OAuthErrorResponse;

  return (
    errorObj.response?.data?.error === 'invalid_grant' ||
    (typeof errorObj.message === 'string' &&
      errorObj.message.includes('invalid_grant'))
  );
};
