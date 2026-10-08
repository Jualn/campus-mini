// error.ts
export interface AppErrorOptions {
  retryAfterMs?: number;
  problemType?: string;
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
  retryAfterMs?: number;
  problemType?: string;
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
    this.retryAfterMs = options.retryAfterMs;
    this.problemType = options.problemType;
    this.statusCode = statusCode;
    this.raw = options.raw;
    this.userMessage = options.userMessage ?? '服务异常，请稍后再试';
    this.silent = options.silent ?? false;
  }
}

export class AuthError extends Error {
  raw?: unknown;
  userMessage: string;
  silent: boolean;

  constructor(message = '登录状态已失效', options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AuthError';
    this.raw = options.raw;
    this.userMessage = options.userMessage ?? '登录状态已失效，请重新进入';
    this.silent = options.silent ?? false;
  }
}

export function getHttpErrorMessage(
  statusCode: number,
  serverMessage?: string,
  problemType?: string,
): string {
  if (problemType === '/problems/profile-content-rejected')
    return '资料内容未通过安全检查，请修改后重试';
  if (problemType === '/problems/profile-safety-check-unavailable')
    return '资料安全检查暂不可用，本次修改未生效，请稍后重试';
  const message = serverMessage?.trim();
  if (message) return message;

  if (statusCode === 401) return '登录状态已失效，请重试';
  if (statusCode === 403) return '暂无权限执行此操作';
  if (statusCode === 404) return '内容不存在或已被删除';
  if (statusCode === 412) return '内容已在其他设备更新，请重新加载后再操作';
  if (statusCode === 428) return '缺少最新版本信息，请重新加载后再操作';
  if (statusCode === 429) return '操作过于频繁，请稍后再试';
  if (statusCode >= 500) return '服务暂时不可用，请稍后再试';

  return '请求失败，请稍后再试';
}

export const isBusinessError = (e: unknown): e is BusinessError => e instanceof BusinessError;
export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;
export const isHttpError = (e: unknown): e is HttpError => e instanceof HttpError;
export const isAuthError = (e: unknown): e is AuthError => e instanceof AuthError;
