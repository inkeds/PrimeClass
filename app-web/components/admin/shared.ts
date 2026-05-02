import { ApiError } from '@/components/admin/lib/api';

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '发生未知错误';
}
