// stream.ts
import config from '../config/index';
import { createLogger } from './logger';
import { NetworkError, HttpError, AuthError, getHttpErrorMessage } from './error';
import { wxHideLoading, wxShowLoading } from './wx-promise';
import { getAuthToken, recoverAuthToken } from './auth-transport';

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

  let cache = '';
  let aborted = false;
  let settled = false;
  let loadingVisible = showLoading;
  let attemptId = 0;
  let requestTask: WechatMiniprogram.RequestTask | null = null;
  const queue = createQueue<T>();
  let resolveDone!: () => void;
  let rejectDone!: (e: unknown) => void;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  createLogger(TAG).info(`→ ${method} ${url} [stream]`, data);

  const finishLoading = () => {
    if (!loadingVisible) return;
    loadingVisible = false;
    void wxHideLoading();
  };

  const settleDone = () => {
    if (settled) return;
    settled = true;
    finishLoading();
    queue.push({ type: 'done' });
    resolveDone();
  };

  const settleError = (error: unknown) => {
    if (settled || aborted) return;
    settled = true;
    finishLoading();
    queue.push({ type: 'error', error });
    rejectDone(error);
  };

  const start = async (retried: boolean, recoveredToken?: string): Promise<void> => {
    let token: string;
    try {
      token = recoveredToken ?? (await getAuthToken('required'));
    } catch (err) {
      settleError(err);
      return;
    }

    if (aborted || settled) return;

    cache = '';
    const currentAttempt = ++attemptId;
    const task = wx.request({
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
        if (aborted || settled || currentAttempt !== attemptId) return;

        const code = res.statusCode;
        if (code === 401 && !retried) {
          attemptId += 1;
          void recoverAuthToken(token)
            .then((nextToken) => start(true, nextToken))
            .catch(settleError);
          return;
        }

        if (code === 401) {
          settleError(
            new AuthError(`${TAG} 登录态失效`, {
              userMessage: getHttpErrorMessage(code),
            }),
          );
          return;
        }

        if (code < 200 || code >= 300) {
          settleError(
            new HttpError(code, `${TAG} HTTP ${String(code)}`, {
              userMessage: getHttpErrorMessage(code),
            }),
          );
          return;
        }

        settleDone();
      },

      fail(err) {
        if (aborted || settled || currentAttempt !== attemptId) return;
        settleError(new NetworkError(`${TAG} 网络异常`, err));
      },
    });

    requestTask = task;
    task.onChunkReceived((chunk) => {
      if (aborted || settled || currentAttempt !== attemptId) return;
      finishLoading();

      const result = flushSSELines(cache, chunk.data);
      cache = result.rest;

      for (const payload of result.payloads) {
        if (payload === DONE_SIGNAL) continue;

        try {
          const parsed = parser(payload);
          if (parsed !== null) queue.push({ type: 'value', value: parsed });
        } catch (err) {
          settleError(err);
          task.abort();
          return;
        }
      }
    });
  };

  void start(false);

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
          requestTask?.abort();
          settleDone();

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
      requestTask?.abort();
      settleDone();
    },

    done,
  });
}
