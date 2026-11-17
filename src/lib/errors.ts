import type {ApiErrorDetail, ApiErrorResponse} from '../types/index.ts';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  statusCode: number;
  isOperational?: boolean;
  details?: ApiErrorDetail[];
  requestId?: string;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ApiErrorDetail[];
  public readonly requestId: string;

  constructor(options: AppErrorOptions) {
    super(options.message, options.cause !== undefined ? {cause: options.cause} : undefined);
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    this.requestId = options.requestId ?? generateRequestId();
  }

  public toSafeClientPayload(): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.isOperational
          ? this.message
          : 'An unexpected error occurred. Please try again later.',
        requestId: this.requestId,
        ...(this.isOperational && this.details?.length ? {details: this.details} : {}),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Please check the provided input.', details?: ApiErrorDetail[], requestId?: string) {
    super({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      statusCode: 400,
      isOperational: true,
      details,
      requestId,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required to continue.', requestId?: string) {
    super({
      code: ErrorCode.UNAUTHORIZED,
      message,
      statusCode: 401,
      isOperational: true,
      requestId,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', requestId?: string) {
    super({
      code: ErrorCode.FORBIDDEN,
      message,
      statusCode: 403,
      isOperational: true,
      requestId,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', requestId?: string) {
    super({
      code: ErrorCode.NOT_FOUND,
      message: `${resource} could not be found.`,
      statusCode: 404,
      isOperational: true,
      requestId,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The request conflicts with existing state.', requestId?: string) {
    super({
      code: ErrorCode.CONFLICT,
      message,
      statusCode: 409,
      isOperational: true,
      requestId,
    });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: ApiErrorDetail[], requestId?: string) {
    super({
      code: ErrorCode.BUSINESS_RULE_VIOLATION,
      message,
      statusCode: 422,
      isOperational: true,
      details,
      requestId,
    });
  }
}

export function generateRequestId(): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `req_${timePart}_${randomPart}`;
}

export function normalizeError(error: unknown, requestId?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected internal error occurred.',
    statusCode: 500,
    isOperational: false,
    requestId,
    cause: error,
  });
}

export function formatApiErrorResponse(error: unknown, requestId?: string): {
  statusCode: number;
  body: ApiErrorResponse;
} {
  const normalized = normalizeError(error, requestId);
  return {
    statusCode: normalized.statusCode,
    body: normalized.toSafeClientPayload(),
  };
}
