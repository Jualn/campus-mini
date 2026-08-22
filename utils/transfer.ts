// transfer.ts
import config from '../config/index';
import { createLogger } from './logger';
import { AuthError, BusinessError, HttpError, NetworkError } from './error';
import { wxHideLoading, wxShowLoading } from './wx-promise';
import { storage, STORAGE_KEYS } from './storage';

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

export function upload<T = unknown, D = unknown>(options: UploadOptions<D>): CancellablePromise<T> {
  const { url, filePath, name = 'file', formData, showLoading = false, onProgress } = options;

  if (showLoading) void wxShowLoading({ title: '上传中', mask: true });

  const token = storage.get(STORAGE_KEYS.TOKEN) ?? '';
  const log = createLogger(TAG_UP);
  const cleanData = cleanFormData(formData);

  log.info(`POST ${url}`, { filePath, name, formData: cleanData });

  let wxTask: WechatMiniprogram.UploadTask | null = null;

  const promise = new Promise<T>((resolve, reject) => {
    wxTask = wx.uploadFile({
      url: `${config.baseURL}${url}`,
      filePath,
      name,
      formData: cleanData as WechatMiniprogram.IAnyObject,
      header: { Authorization: `Bearer ${token}` },

      success(res) {
        if (showLoading) void wxHideLoading();

        const { statusCode, data: rawData } = res;
        log.info(`POST ${url} ${String(statusCode)}`);

        if (statusCode === 401) {
          storage.remove(STORAGE_KEYS.TOKEN);
          reject(new AuthError(`${TAG_UP} auth expired`));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new HttpError(statusCode, `${TAG_UP} HTTP ${String(statusCode)} ${url}`));
          return;
        }

        let body: ResponseBody<T>;
        try {
          body = JSON.parse(rawData) as ResponseBody<T>;
        } catch {
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
        if (showLoading) void wxHideLoading();
        reject(new NetworkError(`${TAG_UP} POST ${url} network error`, err));
      },
    });

    if (onProgress) wxTask.onProgressUpdate(onProgress);
  });

  return makeCancellable(promise, () => wxTask?.abort());
}

export function download(options: DownloadOptions): CancellablePromise<DownloadResult> {
  const { url, showLoading = false, onProgress } = options;

  if (showLoading) void wxShowLoading({ title: '下载中', mask: true });

  const token = storage.get(STORAGE_KEYS.TOKEN) ?? '';
  const log = createLogger(TAG_DOWN);
  log.info(`GET ${url}`);

  let wxTask: WechatMiniprogram.DownloadTask | null = null;

  const promise = new Promise<DownloadResult>((resolve, reject) => {
    wxTask = wx.downloadFile({
      url: `${config.baseURL}${url}`,
      header: { Authorization: `Bearer ${token}` },

      success(res) {
        if (showLoading) void wxHideLoading();

        const { statusCode, tempFilePath, profile } = res;
        log.info(`GET ${url} ${String(statusCode)}`, { tempFilePath });

        if (statusCode === 401) {
          storage.remove(STORAGE_KEYS.TOKEN);
          reject(new AuthError(`${TAG_DOWN} auth expired`));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new HttpError(statusCode, `${TAG_DOWN} HTTP ${String(statusCode)} ${url}`));
          return;
        }

        resolve({ tempFilePath, profile });
      },

      fail(err) {
        if (showLoading) void wxHideLoading();
        reject(new NetworkError(`${TAG_DOWN} GET ${url} network error`, err));
      },
    });

    if (onProgress) wxTask.onProgressUpdate(onProgress);
  });

  return makeCancellable(promise, () => wxTask?.abort());
}
