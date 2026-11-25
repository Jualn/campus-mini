// error.ts
export interface AppErrorOptions {
  validationErrors?: { in: string; pointer: string; code: string }[];
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
    const errMsg = raw && typeof raw === 'object' ? (raw as { errMsg?: unknown }).errMsg : '';
    this.userMessage =
      options.userMessage ??
      (typeof errMsg === 'string' && /timeout/i.test(errMsg)
        ? '请求超时，请稍后重试'
        : '网络异常，请检查网络连接');
    this.silent = options.silent ?? false;
  }
}

export class HttpError extends Error {
  validationErrors?: AppErrorOptions['validationErrors'];
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
    this.validationErrors = options.validationErrors;
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
  if (problemType === '/problems/mentor-question-version-stale')
    return '问题已更新，回答草稿已保留，请重新阅读并核对问题';
  if (problemType === '/problems/mentor-question-content-locked')
    return '已有正式回答公开，原题内容已保护，可维护分类话题或通过讨论补充';
  if (problemType === '/problems/account-content-restricted') return '当前账号暂不能发布或评论';
  if (problemType === '/problems/post-moderation-conflict')
    return '内容已被管理隐藏，可在本人记录回看';
  if (problemType === '/problems/idempotency-key-reused') return '提交凭据冲突，请先核对原提交结果';
  if (problemType === '/problems/report-duplicate') return '已举报此内容，请查看我的举报记录';
  if (problemType === '/problems/post-category-invalid') return '分类无效，请重新选择可用分类';
  if (problemType === '/problems/post-topic-invalid')
    return '话题无效，请检查数量、重复或已禁用话题';
  if (problemType === '/problems/mentor-qualification-unavailable')
    return '导师资格服务暂不可用，请稍后再试';
  if (problemType === '/problems/mentor-answer-forbidden')
    return '暂无正式回答权限，请联系管理员核实人员关联及导师资格';
  if (problemType === '/problems/post-content-rejected') return '内容未通过安全检查，草稿已保留';
  if (problemType === '/problems/post-safety-check-unavailable')
    return '内容安全检查暂不可用，草稿已保留';
  if (problemType === '/problems/profile-content-rejected')
    return '资料内容未通过安全检查，请修改后重试';
  if (problemType === '/problems/profile-safety-check-unavailable')
    return '资料安全检查暂不可用，本次修改未生效，请稍后重试';
  const message = serverMessage?.trim();
  if (message) return message;

  if (statusCode === 401) return '登录状态已失效，请重试';
  if (statusCode === 403) return '暂无权限执行此操作';
  if (statusCode === 404) return '内容不存在或已被删除';
  if (statusCode === 400 || statusCode === 422) return '请检查填写内容后重试';
  if (statusCode === 409) return '当前状态已变化，请刷新后确认';
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

/** A failed refresh may retain content only while its access/existence has not been rejected. */
export function isReadAccessError(error: unknown): boolean {
  return isAuthError(error) || (isHttpError(error) && [401, 403, 404].includes(error.statusCode));
}
