// error.ts
// 业务错误（后端返回 code !== 200）
export class BusinessError extends Error {
  code: number;
  data?: unknown; // ? 可为空

  constructor(code: number, message: string, data: unknown) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.data = data;
  }
}

// 网络错误（请求失败、超时）
export class NetworkError extends Error {
  raw?: unknown;
  constructor(message = '网络异常，请重试', raw: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.raw = raw; // 原始 wx.request fail 的错误对象
  }
}

// HTTP错误（状态码非200）
export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message = `HTTP ${statusCode.toString()}`) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

// 登录态错误（401）
export class AuthError extends Error {
  constructor(message = '登录已过期') {
    super(message);
    this.name = 'AuthError';
  }
}

// 统一判断类型     : e is xxxx  表示返回为true的话，那后续e就被ts认定为xxx类型，避免后续还是unknow类型     => 表示返回值，为boolean
export const isBusinessError = (e: unknown): e is BusinessError => e instanceof BusinessError;
export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;
export const isAuthError = (e: unknown): e is AuthError => e instanceof AuthError;
