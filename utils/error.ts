// error.ts
export interface AppErrorOptions {
  userMessage?: string;
  silent?: boolean;
  raw?: unknown;
}

export class BusinessError extends Error {
  code: number;
  data?: unknown;
  userMessage: string;
  silent: boolean;

  constructor(code: number, message: string, data?: unknown, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.data = data;
    this.userMessage = options.userMessage ?? message;
    this.silent = options.silent ?? false;
  }
}

export class NetworkError extends Error {
  raw?: unknown;
  userMessage: string;
  silent: boolean;

  constructor(message = '网络异常，请重试', raw?: unknown, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'NetworkError';
    this.raw = options.raw ?? raw;
    this.userMessage = options.userMessage ?? '网络异常，请检查网络连接';
    this.silent = options.silent ?? false;
  }
}

export class HttpError extends Error {
  statusCode: number;
  raw?: unknown;
  userMessage: string;
  silent: boolean;

  constructor(
    statusCode: number,
    message = `HTTP ${statusCode.toString()}`,
    options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.raw = options.raw;
    this.userMessage = options.userMessage ?? '服务异常，请稍后再试';
    this.silent = options.silent ?? false;
  }
}

export class AuthError extends Error {
  userMessage: string;
  silent: boolean;

  constructor(message = '登录状态已失效', options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AuthError';
    this.userMessage = options.userMessage ?? '登录状态已失效，请重新进入';
    this.silent = options.silent ?? false;
  }
}

export const isBusinessError = (e: unknown): e is BusinessError => e instanceof BusinessError;
export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;
export const isHttpError = (e: unknown): e is HttpError => e instanceof HttpError;
export const isAuthError = (e: unknown): e is AuthError => e instanceof AuthError;
