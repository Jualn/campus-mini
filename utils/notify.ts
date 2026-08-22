import {
  type AuthError,
  type BusinessError,
  type HttpError,
  type NetworkError,
  isAuthError,
  isBusinessError,
  isHttpError,
  isNetworkError,
} from './error';
import { wxShowToast } from './wx-promise';

type ToastIcon = NonNullable<WechatMiniprogram.ShowToastOption['icon']>;

export type NotifyLevel = 'success' | 'info' | 'warning' | 'error';

export interface NotifyPayload {
  title: string;
  level: NotifyLevel;
  duration: number;
  mask?: boolean;
}

export type NotifyRenderer = (payload: NotifyPayload) => void;

export interface NotifyOptions {
  duration?: number;
  icon?: ToastIcon;
  mask?: boolean;
  silent?: boolean;
}

export interface ErrorToastOptions extends NotifyOptions {
  fallback?: string;
}

type AppDisplayError = BusinessError | NetworkError | HttpError | AuthError;

const DEFAULT_ERROR_MESSAGE = '操作失败，请稍后再试';
let notifyRenderer: NotifyRenderer | null = null;

/** 注册自定义通知组件的渲染函数；组件卸载时调用返回的函数解除注册。 */
export function registerNotifyRenderer(renderer: NotifyRenderer): () => void {
  notifyRenderer = renderer;

  return () => {
    if (notifyRenderer === renderer) notifyRenderer = null;
  };
}

function hasUserMessage(err: unknown): err is AppDisplayError {
  return isBusinessError(err) || isNetworkError(err) || isHttpError(err) || isAuthError(err);
}

export function getErrorMessage(err: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  if (hasUserMessage(err)) {
    return err.userMessage || fallback;
  }

  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }

  return fallback;
}

export function isSilentError(err: unknown): boolean {
  return hasUserMessage(err) && err.silent;
}

function renderToast(title: string, level: NotifyLevel, options: NotifyOptions = {}): void {
  const text = title.trim();
  if (!text || options.silent) return;

  if (notifyRenderer) {
    notifyRenderer({
      title: text,
      level,
      duration: options.duration ?? 1800,
      mask: options.mask,
    });
    return;
  }

  void wxShowToast({
    title: text,
    icon: options.icon ?? 'none',
    duration: options.duration ?? 1800,
    mask: options.mask,
  });
}

export function showToast(title: string, options: NotifyOptions = {}): void {
  renderToast(title, 'info', options);
}

/**
 * 兼容微信 Toast 对象参数的统一入口。
 * 旧页面迁移到通知层时可保持原参数；新代码优先调用带语义的通知函数。
 */
export function notifyToast(options: WechatMiniprogram.ShowToastOption): void {
  const level: NotifyLevel =
    options.icon === 'success' ? 'success' : options.icon === 'error' ? 'error' : 'info';

  renderToast(options.title, level, {
    duration: options.duration,
    icon: options.icon,
    mask: options.mask,
  });
}

export function showSuccessToast(title: string, options: NotifyOptions = {}): void {
  renderToast(title, 'success', {
    ...options,
    icon: options.icon ?? 'success',
  });
}

export function showInfoToast(title: string, options: NotifyOptions = {}): void {
  renderToast(title, 'info', {
    ...options,
    icon: options.icon ?? 'none',
  });
}

export function showWarningToast(title: string, options: NotifyOptions = {}): void {
  renderToast(title, 'warning', {
    ...options,
    icon: options.icon ?? 'none',
  });
}

export function showErrorToast(err: unknown, options: ErrorToastOptions = {}): boolean {
  if (options.silent || isSilentError(err)) return false;

  renderToast(getErrorMessage(err, options.fallback), 'error', {
    ...options,
    icon: options.icon ?? 'none',
  });

  return true;
}
