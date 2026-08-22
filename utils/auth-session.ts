type AuthRefreshHandler = () => Promise<void>;

let authRefreshHandler: AuthRefreshHandler | null = null;
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

export async function refreshAuth(): Promise<boolean> {
  if (!authRefreshHandler) return false;
  await authRefreshHandler();
  return true;
}
