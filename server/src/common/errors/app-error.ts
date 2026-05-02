export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: number;
  readonly data?: unknown;

  constructor(httpStatus: number, code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.data = data;
  }
}

export function assertFound<T>(
  value: T | null | undefined,
  message = 'Resource not found',
  code = 40400,
): T {
  if (value == null) {
    throw new AppError(404, code, message);
  }

  return value;
}
