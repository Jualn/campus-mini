// transfer.ts
import config from '../config/index';
import { createLogger } from './logger';
import {
  AuthError,
  BusinessError,
  HttpError,
  NetworkError,
  getHttpErrorMessage,
  isAuthError,
} from './error';
import { wxHideLoading, wxShowLoading } from './wx-promise';
import { getAuthToken, recoverAuthToken } from './auth-transport';

const TAG_UP = 'Upload';
const TAG_DOWN = 'Download';
const SUCCESS_CODE = 200;
const SILENT_CODES: number[] = [10010];

export interface UploadOptions<D = unknown> {
  url: string;
  filePath: string;
  name?: string;
  formData?: D;
  showLoading?: boolean;
  onProgress?: (res: WechatMiniprogram.UploadTaskOnProgressUpdateListenerResult) => void;
}

export interface DownloadOptions {
  url: string;
  showLoading?: boolean;
  onProgress?: (res: WechatMiniprogram.DownloadTaskOnProgressUpdateListenerResult) => void;
}

export interface DownloadResult {
  tempFilePath: string;
  profile?: WechatMiniprogram.RequestProfile;
}

interface ResponseBody<T = unknown> {
  code: number;
  message?: string;
  msg?: string;
  data: T;
  timestamp?: number;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  traceId?: string;
}

export type CancellablePromise<T> = Promise<T> & { abort(): void };

function makeCancellable<T>(promise: Promise<T>, abort: () => void): CancellablePromise<T> {
  return Object.assign(promise, { abort });
}

function getResponseMessage(body: Partial<ResponseBody> | undefined): string {
  const message = body?.message?.trim();
  if (message) return message;

  const legacyMessage = body?.msg?.trim();
  if (legacyMessage) return legacyMessage;

  return '操作失败';
}

function getServerMessage(body: Partial<ResponseBody> | ProblemDetails | undefined): string | undefined {
  if (!body) return undefined;
  if ('detail' in body && body.detail?.trim()) return body.detail;
  if ('message' in body && body.message?.trim()) return body.message;
  if ('msg' in body && body.msg?.trim()) return body.msg;
  return undefined;
}

function unwrapResponse(rawBody: unknown, tag: string): unknown {
  if (!rawBody || typeof rawBody !== 'object' || !('code' in rawBody)) {
    throw new NetworkError(`${tag} invalid response body`, rawBody, {
      userMessage: '服务响应异常，请稍后再试',
    });
  }

  const body = rawBody as Partial<ResponseBody>;
  if (typeof body.code !== 'number') {
    throw new NetworkError(`${tag} invalid response body`, rawBody, {
      userMessage: '服务响应异常，请稍后再试',
    });
  }

  if (body.code !== SUCCESS_CODE) {
    const userMessage = getResponseMessage(body);
    throw new BusinessError(body.code, `${tag} business error: ${userMessage}`, body.data, {
      userMessage,
      silent: SILENT_CODES.includes(body.code),
    });
  }

  return body.data;
}

function cleanFormData<D>(formData: D | undefined): D | Record<string, unknown> | undefined {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return formData;
  return Object.fromEntries(Object.entries(formData).filter(([, value]) => value !== undefined));
}

function createAbortError(tag: string): NetworkError {
  return new NetworkError(`${tag} aborted`, undefined, {
    userMessage: '操作已取消',
    silent: true,
  });
}

export function upload<T = unknown, D = unknown>(options: UploadOptions<D>): CancellablePromise<T> {
  const { url, filePath, name = 'file', formData, showLoading = false, onProgress } = options;

  if (showLoading) void wxShowLoading({ title: '上传中', mask: true });

  const log = createLogger(TAG_UP);
  const cleanData = cleanFormData(formData);

  log.info(`POST ${url}`, { filePath, name, formData: cleanData });

  let wxTask: WechatMiniprogram.UploadTask | null = null;
  let aborted = false;

  const runUpload = (token: string): Promise<T> =>
    new Promise((resolve, reject) => {
      if (aborted) {
        reject(createAbortError(TAG_UP));
        return;
      }

      wxTask = wx.uploadFile({
        url: `${config.baseURL}${url}`,
        filePath,
        name,
        formData: cleanData as WechatMiniprogram.IAnyObject,
        header: { Authorization: `Bearer ${token}` },

        success(res) {
          const { statusCode, data: rawData } = res;
          log.info(`POST ${url} ${String(statusCode)}`);

          let body: ResponseBody<T> | ProblemDetails | undefined;
          try {
            body = JSON.parse(rawData) as ResponseBody<T> | ProblemDetails;
          } catch {
            body = undefined;
          }

          if (statusCode === 401) {
            reject(
              new AuthError(`${TAG_UP} auth expired`, {
                userMessage: getHttpErrorMessage(statusCode, getServerMessage(body)),
                raw: body,
              }),
            );
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new HttpError(statusCode, `${TAG_UP} HTTP ${String(statusCode)} ${url}`, {
                raw: body ?? rawData,
                userMessage: getHttpErrorMessage(statusCode, getServerMessage(body)),
              }),
            );
            return;
          }

          if (!body) {
            reject(
              new NetworkError(`${TAG_UP} invalid JSON response`, rawData, {
                userMessage: '服务响应异常，请稍后再试',
              }),
            );
            return;
          }

          log.info('body', body);

          try {
            resolve(unwrapResponse(body, TAG_UP) as T);
          } catch (err) {
            reject(
              err instanceof Error
                ? err
                : new NetworkError(`${TAG_UP} response handling failed`, err),
            );
          }
        },

        fail(err) {
          reject(
            aborted
              ? createAbortError(TAG_UP)
              : new NetworkError(`${TAG_UP} POST ${url} network error`, err),
          );
        },
      });

      if (onProgress) wxTask.onProgressUpdate(onProgress);
    });

  const promise = (async () => {
    try {
      let token = await getAuthToken('required');

      try {
        return await runUpload(token);
      } catch (err) {
        if (!isAuthError(err)) throw err;
        token = await recoverAuthToken(token);
        return await runUpload(token);
      }
    } finally {
      if (showLoading) void wxHideLoading();
    }
  })();

  return makeCancellable(promise, () => {
    aborted = true;
    wxTask?.abort();
  });
}

export function download(options: DownloadOptions): CancellablePromise<DownloadResult> {
  const { url, showLoading = false, onProgress } = options;

  if (showLoading) void wxShowLoading({ title: '下载中', mask: true });

  const log = createLogger(TAG_DOWN);
  log.info(`GET ${url}`);

  let wxTask: WechatMiniprogram.DownloadTask | null = null;
  let aborted = false;

  const runDownload = (token: string): Promise<DownloadResult> =>
    new Promise((resolve, reject) => {
      if (aborted) {
        reject(createAbortError(TAG_DOWN));
        return;
      }

      wxTask = wx.downloadFile({
        url: `${config.baseURL}${url}`,
        header: { Authorization: `Bearer ${token}` },

        success(res) {
          const { statusCode, tempFilePath, profile } = res;
          log.info(`GET ${url} ${String(statusCode)}`, { tempFilePath });

          if (statusCode === 401) {
            reject(
              new AuthError(`${TAG_DOWN} auth expired`, {
                userMessage: getHttpErrorMessage(statusCode),
              }),
            );
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new HttpError(statusCode, `${TAG_DOWN} HTTP ${String(statusCode)} ${url}`, {
                userMessage: getHttpErrorMessage(statusCode),
              }),
            );
            return;
          }

          resolve({ tempFilePath, profile });
        },

        fail(err) {
          reject(
            aborted
              ? createAbortError(TAG_DOWN)
              : new NetworkError(`${TAG_DOWN} GET ${url} network error`, err),
          );
        },
      });

      if (onProgress) wxTask.onProgressUpdate(onProgress);
    });

  const promise = (async () => {
    try {
      let token = await getAuthToken('required');

      try {
        return await runDownload(token);
      } catch (err) {
        if (!isAuthError(err)) throw err;
        token = await recoverAuthToken(token);
        return await runDownload(token);
      }
    } finally {
      if (showLoading) void wxHideLoading();
    }
  })();

  return makeCancellable(promise, () => {
    aborted = true;
    wxTask?.abort();
  });
}
