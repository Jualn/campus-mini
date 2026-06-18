// request.ts
import config from '../config/index';
import createLogger from './logger';
import { BusinessError, NetworkError, HttpError, AuthError } from './error';
import { wxHideLoading, wxShowLoading, wxShowToast } from './wx-promise';
import { upload, download } from './transfer';
import { stream } from './stream';
import { authReady, ensureLogin } from '../services/auth';
import storage, { STORAGE_KEYS } from './storage';

const TAG = 'Request';

// ── 类型定义 ──────────────────────────────────────────────────────────

export interface RequestOptions<D = unknown> {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: D;
  showLoading?: boolean;
  _retry?: boolean;
  isLogin?: boolean;
}

interface ResponseBody<T = unknown> {
  code: number;
  msg: string;
  data: T;
  timestamp: number;
}

interface Interceptor<T> {
  fulfilled?: (val: T) => T | Promise<T>;
  rejected?: (err: unknown) => unknown;
}

// ── 拦截器队列（类似 axios interceptors）──────────────────────────────
const interceptors = {
  request: [] as Interceptor<RequestOptions>[],
  response: [] as Interceptor<unknown>[],
};

// 对齐 axios 风格：addXxxInterceptor(fulfilled, rejected)
export const addRequestInterceptor = (
  fulfilled?: (opts: RequestOptions) => RequestOptions | Promise<RequestOptions>,
  rejected?: (err: unknown) => unknown,
) => interceptors.request.push({ fulfilled, rejected });

export const addResponseInterceptor = (
  fulfilled?: (data: unknown) => unknown,
  rejected?: (err: unknown) => unknown,
) => interceptors.response.push({ fulfilled, rejected });

// ── 核心请求 ──────────────────────────────────────────────────────────
function rawRequest<
  T extends string | WechatMiniprogram.IAnyObject | ArrayBuffer =
    | string
    | WechatMiniprogram.IAnyObject
    | ArrayBuffer,
>(
  options: WechatMiniprogram.RequestOption,
): Promise<WechatMiniprogram.RequestSuccessCallbackResult<T>> {
  return new Promise((resolve, reject) => {
    wx.request<T>({ ...options, success: resolve, fail: reject });
  });
}

// ── 请求主函数 ────────────────────────────────────────────────────────
async function request<T = unknown, D = unknown>(options: RequestOptions<D>): Promise<T> {
  // 1. 等待 auth 就绪（确保登录状态已恢复或完成）
  const {isLogin} = options;
  if (!isLogin) await authReady;

  // 1. 执行请求拦截器（可在此注入 token、公参等）, 内部用any，拦截器不需要关心数据类型
  // any 接收赋值，如果作为unknow，后续赋值如果，限定为string = unknow就行不通，只能 string = any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let opts: RequestOptions<any> = { ...options };
  for (const { fulfilled } of interceptors.request) {
    if (fulfilled) opts = await fulfilled(opts);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { url, method = 'GET', data = {}, showLoading = false, _retry = false } = opts;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const cleanData =
    data && typeof data === 'object' && !Array.isArray(data)
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
      : data;

  // 只有非重试请求才显示 loading
  if (showLoading && !_retry) void wxShowLoading({ title: '加载中', mask: true });

  createLogger('Request').info(`→ ${method} ${url}`, cleanData);

  let res: WechatMiniprogram.RequestSuccessCallbackResult<ResponseBody<T>>;
  try {
    const token = storage.get(STORAGE_KEYS.TOKEN) ?? '';
    res = await rawRequest<ResponseBody<T>>({
      url: `${config.baseURL}${url}`,
      method,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: cleanData,
      timeout: config.timeout,
      header: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
    });
  } catch (err) {
    if (showLoading) void wxHideLoading();
    throw new NetworkError(TAG + `✗ ${method} ${url} 网络异常，请检查网络连接`, err);
  }

  if (showLoading) void wxHideLoading();

  const { statusCode, data: body } = res;
  createLogger('Response').info(`← ${method} ${url} ${statusCode.toString()}`, body);

  // 2. HTTP 层错误
  if (statusCode === 401) {
    storage.remove(STORAGE_KEYS.TOKEN);

    if (!_retry) {
      // 可在此触发静默重新登录后重试，目前仅示意
      await ensureLogin();
      return request<T, D>({ ...options, _retry: true }); // 重试，loading 不重复显示
    }

    // wx.redirectTo({ url: '/pages/login/login' });
    throw new AuthError(TAG + '登录态失效');
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new HttpError(statusCode, TAG + `✗ HTTP ${statusCode.toString()}` + url);
  }

  // 3. 业务层错误（后端 code 约定）
  if (body.code !== 200) {
    const SILENT_CODES: number[] = [10010];
    if (!SILENT_CODES.includes(body.code)) {
      void wxShowToast({ title: body.msg || '操作失败', icon: 'none' });
    }
    throw new BusinessError(body.code, TAG + `业务错误` + body.msg, body.data);
  }

  // 4. 执行响应拦截器
  let result: unknown = body.data;
  for (const { fulfilled } of interceptors.response) {
    if (fulfilled) result = await fulfilled(result);
  }

  return result as T;
}

// ── http 对象（调用侧：http.get / http.post / ...）────────────────────
type ExtraOpts = Omit<RequestOptions, 'url' | 'method' | 'data'>;

// T 对于响应类型进行约束,D 对于请求data进行约束，作为unknow，通用，不做特别约束，进行调用时，交给业务层调用各自定义的interface，进行约束
const http = {
  get<T = unknown>(url: string, data?: unknown, opts?: ExtraOpts) {
    return request<T>({ url, method: 'GET', data, ...opts });
  },
  post<T = unknown>(url: string, data?: unknown, opts?: ExtraOpts) {
    return request<T>({ url, method: 'POST', data, ...opts });
  },
  put<T = unknown>(url: string, data?: unknown, opts?: ExtraOpts) {
    return request<T>({ url, method: 'PUT', data, ...opts });
  },
  del<T = unknown>(url: string, data?: unknown, opts?: ExtraOpts) {
    return request<T>({ url, method: 'DELETE', data, ...opts });
  },

  /**
   * 上传文件，封装 wx.uploadFile，返回可取消的 Promise。
   * @param url 相对路径，自动拼接 config.baseURL
   * @param filePath wx.chooseMedia / wx.chooseImage 返回的本地临时路径
   * @param name 对应服务端接收字段名，默认 "file"
   * @param formData 随文件一起提交的表单字段
   * @param showLoading 是否显示加载中提示
   * @param onProgress 上传进度回调，参数同 wx.uploadFile 的 onProgressUpdate
   * @returns 上传结果，类型由调用时指定
   */
  upload<T = unknown>(
    url: string,
    filePath: string,
    name?: string,
    formData?: unknown,
    showLoading?: boolean,
    onProgress?: (res: WechatMiniprogram.UploadTaskOnProgressUpdateListenerResult) => void,
  ) {
    return upload<T>({ url, filePath, name, formData, showLoading, onProgress });
  },

  /**
   * 下载文件，返回临时文件路径和请求元信息
   * @param url 相对路径，自动拼接 config.baseURL
   * @param showLoading 是否显示加载中提示
   * @param onProgress 下载进度回调，参数同 wx.downloadFile 的 onProgressUpdate
   * @returns 下载结果，包含临时文件路径和请求元信息
   */
  download(
    url: string,
    showLoading?: boolean,
    onProgress?: (res: WechatMiniprogram.DownloadTaskOnProgressUpdateListenerResult) => void,
  ) {
    return download({ url, showLoading, onProgress });
  },

  /**
   * 流式请求，适用于服务器通过分块传输（chunked transfer）持续推送数据的场景。
   * 通过 parser 参数自定义每行数据的解析方式，返回一个可异步迭代的 StreamTask。
   * 该 StreamTask 包含一个 done Promise，表示流结束，以及一个 abort 方法用于取消请求。
   *
   * @param url 相对路径，自动拼接 config.baseURL
   * @param data 请求数据，支持对象（会过滤掉 undefined 字段）、字符串或 ArrayBuffer
   * @param showLoading 是否显示加载中提示
   * @param parser 每行数据的解析函数,line就表示传输过程中data:xx的xx信息,返回 T 类型或 null（表示该行数据被过滤掉）
   * @returns
   */
  stream<T = unknown>(
    url: string,
    data?: unknown,
    showLoading?: boolean,
    parser?: (line: string) => T | null,
  ) {
    return stream<T>({ url, data, showLoading, parser });
  },
};

export default http;
