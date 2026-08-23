type AuthRefreshHandler = (failedToken?: string) => Promise<void>;

let authRefreshHandler: AuthRefreshHandler | null = null;
let authRefreshPromise: Promise<void> | null = null;
let authReadyResolved = false;
let resolveAuthReady: () => void;

/** App 启动阶段的认证门闩；无论自动登录成功或失败，初始化结束后都会放行。 */
export const authReady = new Promise<void>((resolve) => {
  resolveAuthReady = resolve;
});

export function markAuthReady(): void {
  if (authReadyResolved) return;
  authReadyResolved = true;
  resolveAuthReady();
}

/**
 * 由 Auth Action 注册刷新实现，Request 只依赖这个底层契约，避免反向依赖 Action。
 */
export function registerAuthRefreshHandler(handler: AuthRefreshHandler): () => void {
  authRefreshHandler = handler;

  return () => {
    if (authRefreshHandler === handler) authRefreshHandler = null;
  };
}

/** 等待启动认证和运行期重新认证全部稳定后再发请求。 */
export async function waitForAuthStable(): Promise<void> {
  await authReady;

  while (authRefreshPromise) {
    await authRefreshPromise;
  }
}

/**
 * 运行期重新认证。所有并发 401 共用同一个任务，failedToken 用于识别迟到的旧请求。
 */
export async function refreshAuth(failedToken?: string): Promise<boolean> {
  if (!authRefreshHandler) return false;

  if (authRefreshPromise) {
    await authRefreshPromise;
    return true;
  }

  const refreshPromise = Promise.resolve().then(() => authRefreshHandler?.(failedToken));
  authRefreshPromise = refreshPromise;

  try {
    await refreshPromise;
    return true;
  } finally {
    if (authRefreshPromise === refreshPromise) authRefreshPromise = null;
  }
}
