// auth.ts
import * as authService from '../services/auth';
import { wxLogin } from '../utils/wx-promise';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { appStore } from '../stores/index';
import { clearUserState } from '../stores/helper';
import { createLogger } from '../utils/logger';
import { eventBus, EVENTS } from '../utils/event-bus';
import {
  authReady,
  markAuthReady,
  registerAuthRefreshHandler,
  isAuthRecoverySuppressed,
  suppressAuthRecovery,
} from '../utils/auth-session';

const log = createLogger('AuthAction');

let _loginPromise: Promise<void> | null = null;
let authGeneration = 0;
let loggingOut = false; // 防并发

export { authReady };

export const getToken = () => storage.get(STORAGE_KEYS.TOKEN);
export const saveToken = (token: string) => storage.set(STORAGE_KEYS.TOKEN, token);
export const clearAuth = () => {
  storage.remove(STORAGE_KEYS.TOKEN);
  storage.remove(STORAGE_KEYS.USER_INFO);
  storage.remove(STORAGE_KEYS.USER_SETTING);
  clearUserState();
};
export const isLoggedIn = () =>
  !!getToken() && !isAuthRecoverySuppressed() && !storage.get(STORAGE_KEYS.AUTH_LOGGED_OUT);

/**
 * 微信登录并换取后端登录态
 *
 * 请求体: LoginRequest
 * {
 *   code: string
 * }
 *
 * 响应体: ResultLoginVO
 * {
 *   code: number,
 *   message: string,
 *   data: {
 *     token: string,
 *     userInfo: {
 *       id: number,
 *       nickname: string,
 *       avatarUrl: string,
 *       role: number
 *     }
 *   },
 *   timestamp: number
 * }
 */
/** Passive reads respect logout intent; only a user gesture may request a fresh session. */
export const ensureLogin = (options: { interactive?: boolean } = {}) => {
  if (loggingOut) return Promise.reject(new Error('退出正在处理中'));
  if ((isAuthRecoverySuppressed() || storage.get(STORAGE_KEYS.AUTH_LOGGED_OUT)) && getToken())
    return Promise.reject(new Error('请先重试退出，确认原会话已结束'));
  if (
    (isAuthRecoverySuppressed() || storage.get(STORAGE_KEYS.AUTH_LOGGED_OUT)) &&
    !options.interactive
  )
    return Promise.reject(new Error('你已退出登录，请点击登录后继续'));
  if (isLoggedIn()) return Promise.resolve();
  if (_loginPromise) return _loginPromise;

  const generation = authGeneration;
  _loginPromise = _doLogin()
    .catch((err: unknown) => {
      if (generation === authGeneration) clearAuth();
      throw err;
    })
    .finally(() => {
      _loginPromise = null;
    });
  return _loginPromise;
};

const _doLogin = async () => {
  const generation = authGeneration;
  log.info('开始登录');

  const { code } = await wxLogin();

  const response = await authService.login({ code });

  // 解构返回的数据（ResultLoginVO.data）
  const { token, userInfo } = response;

  if (generation !== authGeneration || loggingOut) {
    try {
      await authService.logout(token);
    } catch (error) {
      saveToken(token);
      throw error;
    }
    return;
  }
  storage.remove(STORAGE_KEYS.AUTH_LOGGED_OUT);
  suppressAuthRecovery(false);
  // 1. 保存到持久化存储
  saveToken(token);
  storage.set(STORAGE_KEYS.USER_INFO, userInfo);

  // 2. 更新到store（运行时状态）
  appStore.setState({
    token,
    userInfo,
  });

  eventBus.emit(EVENTS.LOGIN_SUCCESS);
  log.info('登录成功', { userId: userInfo.id });
};

registerAuthRefreshHandler(async (failedToken) => {
  if (loggingOut || isAuthRecoverySuppressed() || storage.get(STORAGE_KEYS.AUTH_LOGGED_OUT))
    throw new Error('请主动重新登录');
  const currentToken = getToken();

  // 迟到的旧请求不能清除另一个刷新任务刚写入的新 token。
  if (failedToken && currentToken && currentToken !== failedToken) return;

  clearAuth();
  await ensureLogin();
});

/**
 * 初始化用户信息（App启动时调用）
 * 从storage恢复登录状态
 */
export const initUserInfo = async (): Promise<void> => {
  if (storage.get(STORAGE_KEYS.AUTH_LOGGED_OUT)) {
    suppressAuthRecovery(true);
    clearUserState();
    markAuthReady();
    return;
  }
  const token = storage.get(STORAGE_KEYS.TOKEN);
  const userInfo = storage.get(STORAGE_KEYS.USER_INFO);

  if (token && userInfo) {
    appStore.setState({ token, userInfo });
    eventBus.emit(EVENTS.LOGIN_SUCCESS);
    log.info('从storage恢复用户信息', { userId: userInfo.id });
    markAuthReady();
    return;
  }

  try {
    await ensureLogin();
  } catch (err) {
    log.error('自动登录失败', err);
  } finally {
    // 失败也要放行，否则所有普通请求都会永久等待。
    markAuthReady();
  }
};

export const logout = async () => {
  if (loggingOut) return;
  loggingOut = true;
  // Also keep this marker on unknown outcomes: ordinary transport must not resume the session.
  suppressAuthRecovery(true);
  authGeneration++;
  try {
    if (!storage.set(STORAGE_KEYS.AUTH_LOGGED_OUT, true))
      throw new Error('无法安全保存退出状态，请重试');
    const token = getToken();
    if (token) await authService.logout(token);
    // A login already in flight must discard and revoke its late candidate before logout resolves.
    if (_loginPromise) await _loginPromise;
    storage.set(STORAGE_KEYS.AUTH_LOGGED_OUT, true);
    storage.remove(STORAGE_KEYS.REGISTRATION_FIELD_CANDIDATES);
    clearAuth();
    eventBus.emit(EVENTS.LOGOUT);
  } finally {
    // On failure retain the token so an explicit retry can resolve the unknown outcome.
    loggingOut = false;
  }
};
