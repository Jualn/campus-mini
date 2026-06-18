// transfer.ts
import config from '../config/index';
import createLogger from './logger';
import { BusinessError, NetworkError, HttpError, AuthError } from './error';
import { wxGetStorageSync, wxHideLoading, wxShowLoading, wxShowToast } from './wx-promise';

const TAG_UP = 'Upload';
const TAG_DOWN = 'Download';

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface UploadOptions<D = unknown> {
  /** 相对路径，自动拼接 config.baseURL */
  url: string;
  /** wx.chooseMedia / wx.chooseImage 返回的本地临时路径 */
  filePath: string;
  /** 对应服务端接收字段名，默认 "file" */
  name?: string;
  /** 随文件一起提交的表单字段 */
  formData?: D;
  showLoading?: boolean;
  /** 上传进度回调，0-100 */
  onProgress?: (res: WechatMiniprogram.UploadTaskOnProgressUpdateListenerResult) => void;
}

export interface DownloadOptions {
  /** 相对路径，自动拼接 config.baseURL */
  url: string;
  showLoading?: boolean;
  /** 下载进度回调，0-100 */
  onProgress?: (res: WechatMiniprogram.DownloadTaskOnProgressUpdateListenerResult) => void;
}

export interface DownloadResult {
  tempFilePath: string;
  profile?: WechatMiniprogram.RequestProfile;
}

// 与 request.ts 共用同一 ResponseBody 结构
interface ResponseBody<T = unknown> {
  code: number;
  msg: string;
  data: T;
  timestamp: number;
}

/**
 * 带 .abort() 的 Promise，方便在页面 onUnload 时取消进行中的传输任务。
 *
 * @example
 * const task = http.upload({ url: '/file/upload', filePath });
 * task.abort(); // 取消上传
 */
export type CancellablePromise<T> = Promise<T> & { abort(): void };

function makeCancellable<T>(promise: Promise<T>, abort: () => void): CancellablePromise<T> {
  return Object.assign(promise, { abort });
}

// ── 通用：业务层错误处理（与 request.ts 保持一致）──────────────────────
const SILENT_CODES: number[] = [10010];

function handleBusinessError<T>(body: ResponseBody<T>, tag: string): T {
  if (body.code !== 200) {
    if (!SILENT_CODES.includes(body.code)) {
      void wxShowToast({ title: body.msg || '操作失败', icon: 'none' });
    }
    throw new BusinessError(body.code, `${tag} 业务错误: ${body.msg}`, body.data);
  }
  return body.data;
}

// ── 上传 ──────────────────────────────────────────────────────────────

/**
 * 封装 wx.uploadFile，返回可取消的 Promise。
 *
 * 响应体统一走 ResponseBody<T> 协议（服务端返回 JSON 字符串）。
 *
 * @example
 * const task = upload<{ fileUrl: string }>({
 *   url: '/file/avatar',
 *   filePath: tempFilePath,
 *   showLoading: true,
 *   onProgress: ({ progress }) => console.log(progress),
 * });
 * const { fileUrl } = await task;
 */
export function upload<T = unknown, D = unknown>(options: UploadOptions<D>): CancellablePromise<T> {
  const { url, filePath, name = 'file', formData, showLoading = false, onProgress } = options;

  if (showLoading) void wxShowLoading({ title: '上传中', mask: true });

  const token = (wxGetStorageSync('token') as string) || '';
  createLogger(TAG_UP).info(`→ POST ${url}`, { filePath, name, formData });

  // 持有 task 引用，用于 abort & onProgress
  let wxTask: WechatMiniprogram.UploadTask | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanData: any =
    formData && typeof formData === 'object' && !Array.isArray(formData)
      ? Object.fromEntries(Object.entries(formData).filter(([, v]) => v !== undefined))
      : formData;

  const promise = new Promise<T>((resolve, reject) => {
    wxTask = wx.uploadFile({
      url: `${config.baseURL}${url}`,
      filePath,
      name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      formData: cleanData,
      header: { Authorization: `Bearer ${token}` },

      success(res) {
        if (showLoading) void wxHideLoading();

        const { statusCode, data: rawData } = res;
        createLogger(TAG_UP).info(`← POST ${url} ${String(statusCode)}`);

        // HTTP 层错误
        if (statusCode === 401) {
          wx.removeStorageSync('token');
          reject(new AuthError(`${TAG_UP} 登录态失效`));
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          reject(new HttpError(statusCode, `${TAG_UP} ✗ HTTP ${String(statusCode)} ${url}`));
          return;
        }

        // wx.uploadFile 的 data 是字符串，需手动解析
        let body: ResponseBody<T>;
        try {
          body = JSON.parse(rawData) as ResponseBody<T>;
        } catch {
          reject(new NetworkError(`${TAG_UP} ✗ 响应 JSON 解析失败`, rawData));
          return;
        }

        createLogger(TAG_UP).info('body', body);

        try {
          resolve(handleBusinessError(body, TAG_UP));
        } catch (err) {
          reject(new BusinessError(500, `${TAG_UP} 业务错误`, err));
        }
      },

      fail(err) {
        if (showLoading) void wxHideLoading();
        reject(new NetworkError(`${TAG_UP} ✗ POST ${url} 网络异常，请检查网络连接`, err));
      },
    });

    if (onProgress) wxTask.onProgressUpdate(onProgress);
  });

  return makeCancellable(promise, () => wxTask?.abort());
}

// ── 下载 ──────────────────────────────────────────────────────────────

/**
 * 封装 wx.downloadFile，返回可取消的 Promise。
 *
 * 成功时 resolve `{ tempFilePath }`，供后续 wx.saveImageToPhotosAlbum、
 * wx.openDocument 等 API 直接使用。
 *
 * @example
 * const task = download({
 *   url: '/file/report.pdf',
 *   showLoading: true,
 *   onProgress: ({ progress }) => setProgress(progress),
 * });
 * const { tempFilePath } = await task;
 * await wx.openDocument({ filePath: tempFilePath });
 */
export function download(options: DownloadOptions): CancellablePromise<DownloadResult> {
  const { url, showLoading = false, onProgress } = options;

  if (showLoading) void wxShowLoading({ title: '下载中', mask: true });

  const token = (wxGetStorageSync('token') as string) || '';
  createLogger(TAG_DOWN).info(`→ GET ${url}`);

  let wxTask: WechatMiniprogram.DownloadTask | null = null;

  const promise = new Promise<DownloadResult>((resolve, reject) => {
    wxTask = wx.downloadFile({
      url: `${config.baseURL}${url}`,
      header: { Authorization: `Bearer ${token}` },

      success(res) {
        if (showLoading) void wxHideLoading();

        const { statusCode, tempFilePath, profile } = res;
        createLogger(TAG_DOWN).info(`← GET ${url} ${String(statusCode)}`, { tempFilePath });

        if (statusCode === 401) {
          wx.removeStorageSync('token');
          reject(new AuthError(`${TAG_DOWN} 登录态失效`));
          return;
        }
        if (statusCode < 200 || statusCode >= 300) {
          reject(new HttpError(statusCode, `${TAG_DOWN} ✗ HTTP ${String(statusCode)} ${url}`));
          return;
        }

        resolve({ tempFilePath, profile });
      },

      fail(err) {
        if (showLoading) void wxHideLoading();
        reject(new NetworkError(`${TAG_DOWN} ✗ GET ${url} 网络异常，请检查网络连接`, err));
      },
    });

    if (onProgress) wxTask.onProgressUpdate(onProgress);
  });

  return makeCancellable(promise, () => wxTask?.abort());
}
