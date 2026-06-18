// stream.ts
import config from '../config/index';
import createLogger from './logger';
import { NetworkError, HttpError, AuthError } from './error';
import { wxGetStorageSync, wxHideLoading, wxShowLoading } from './wx-promise';

const TAG = 'Stream';
const DONE_SIGNAL = '[DONE]';

// ─────────────────────────────────────────
// 类型
// ─────────────────────────────────────────

export interface StreamOptions<T = unknown, D = unknown> {
  url: string;
  method?: 'GET' | 'POST';
  data?: D;
  showLoading?: boolean;

  parser?: (line: string) => T | null;
}

export interface StreamTask<T> extends AsyncIterable<T> {
  abort(): void;
  done: Promise<void>;
}

// ─────────────────────────────────────────
// UTF8 解码（兼容微信小程序）
// ─────────────────────────────────────────

function decodeChunk(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  try {
    let encoded = '';

    for (const byte of bytes) {
      encoded += `%${byte.toString(16).padStart(2, '0')}`;
    }

    return decodeURIComponent(encoded);
  } catch {
    let result = '';

    for (const byte of bytes) {
      result += String.fromCharCode(byte);
    }

    return result;
  }
}

// ─────────────────────────────────────────
// SSE解析
// ─────────────────────────────────────────

function flushSSELines(
  cache: string,
  incoming: ArrayBuffer,
): {
  payloads: string[];
  rest: string;
} {
  const text = cache + decodeChunk(incoming);

  const lines = text.split('\n');

  const rest = lines.pop() ?? '';

  const payloads: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed.startsWith('data:')) continue;

    const payload = trimmed.slice(5).trim();

    if (payload) {
      payloads.push(payload);
    }
  }

  return {
    payloads,
    rest,
  };
}

// ─────────────────────────────────────────
// Queue
// ─────────────────────────────────────────

type QueueItem<T> =
  | { type: 'value'; value: T }
  | { type: 'done' }
  | { type: 'error'; error: unknown };

function createQueue<T>() {
  const queue: QueueItem<T>[] = [];

  const waiting: ((item: QueueItem<T>) => void)[] = [];

  function push(item: QueueItem<T>) {
    if (waiting.length) {
      waiting.shift()?.(item);
      return;
    }

    queue.push(item);
  }

  function pull(): Promise<QueueItem<T>> {
    const item = queue.shift();

    if (item) {
      return Promise.resolve(item);
    }

    return new Promise((resolve) => {
      waiting.push(resolve);
    });
  }

  return {
    push,
    pull,
  };
}

// ─────────────────────────────────────────
// 默认parser
// ─────────────────────────────────────────

function defaultParser(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}

// ─────────────────────────────────────────
// stream
// ─────────────────────────────────────────

export function stream<T = unknown, D = unknown>(options: StreamOptions<T, D>): StreamTask<T> {
  const {
    url,
    method = 'GET',
    data = {} as unknown,
    showLoading = false,
    parser = options.parser ?? ((line: string) => defaultParser(line) as T | null),
  } = options;

  if (showLoading) {
    void wxShowLoading({
      title: '加载中',
      mask: true,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanData: any =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
      : data;

  const token = (wxGetStorageSync('token') as string) || '';

  let cache = '';

  let aborted = false;

  let requestTask: WechatMiniprogram.RequestTask | null = null;

  const queue = createQueue<T>();

  let resolveDone!: () => void;
  let rejectDone!: (e: unknown) => void;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  createLogger(TAG).info(`→ ${method} ${url} [stream]`, data);

  requestTask = wx.request({
    url: `${config.baseURL}${url}`,

    method,

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data: cleanData,

    enableChunked: true,

    responseType: 'text',

    header: {
      Authorization: `Bearer ${token}`,

      Accept: 'text/event-stream',

      'Content-Type': 'application/json',

      'Cache-Control': 'no-cache',
    },

    success(res) {
      if (showLoading) {
        void wxHideLoading();
      }

      if (aborted) return;

      const code = res.statusCode;

      if (code === 401) {
        wx.removeStorageSync('token');

        const err = new AuthError(`${TAG} 登录态失效`);

        queue.push({
          type: 'error',
          error: err,
        });

        rejectDone(err);

        return;
      }

      if (code < 200 || code >= 300) {
        const err = new HttpError(code, `${TAG} HTTP ${String(code)}`);

        queue.push({
          type: 'error',
          error: err,
        });

        rejectDone(err);

        return;
      }

      queue.push({
        type: 'done',
      });

      resolveDone();
    },

    fail(err) {
      if (showLoading) {
        void wxHideLoading();
      }

      if (aborted) return;

      const error = new NetworkError(`${TAG} 网络异常`, err);

      queue.push({
        type: 'error',
        error,
      });

      rejectDone(error);
    },
  });

  requestTask.onChunkReceived((chunk) => {
    if (aborted) return;

    const result = flushSSELines(cache, chunk.data);

    cache = result.rest;

    for (const payload of result.payloads) {
      if (payload === DONE_SIGNAL) {
        continue;
      }

      try {
        const parsed = parser(payload);

        if (parsed !== null) {
          queue.push({
            type: 'value',
            value: parsed,
          });
        }
      } catch (err) {
        queue.push({
          type: 'error',
          error: err,
        });

        rejectDone(err);

        requestTask.abort();

        return;
      }
    }
  });

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          const item = await queue.pull();

          if (item.type === 'error') {
            throw item.error;
          }

          if (item.type === 'done') {
            return {
              value: undefined,
              done: true,
            };
          }

          return {
            value: item.value,
            done: false,
          };
        },

        return(): Promise<IteratorResult<T>> {
          aborted = true;

          requestTask.abort();

          queue.push({
            type: 'done',
          });

          resolveDone();

          return Promise.resolve({
            value: undefined,
            done: true,
          });
        },
      };
    },
  };

  return Object.assign(iterable, {
    abort() {
      aborted = true;

      requestTask.abort();

      queue.push({
        type: 'done',
      });

      resolveDone();
    },

    done,
  });
}
