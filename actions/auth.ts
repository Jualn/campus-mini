// auth.ts
import * as authService from '../services/auth';
import { wxLogin } from '../utils/wx-promise';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { appStore } from '../stores/index';
import { clearUserState } from '../stores/helper';
import { createLogger } from '../utils/logger';
import { eventBus, EVENTS } from '../utils/event-bus';
import { authReady, markAuthReady, registerAuthRefreshHandler } from '../utils/auth-session';

const log = createLogger('AuthAction');

let _loginPromise: Promise<void> | null = null; // 防并发

export { authReady };

export const getToken = () => storage.get(STORAGE_KEYS.TOKEN);
export const saveToken = (token: string) => storage.set(STORAGE_KEYS.TOKEN, token);
export const clearAuth = () => {
  storage.remove(STORAGE_KEYS.TOKEN);
  storage.remove(STORAGE_KEYS.USER_INFO);
  storage.remove(STORAGE_KEYS.USER_SETTING);
  clearUserState();
};
export const isLoggedIn = () => !!getToken();

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
export const ensureLogin = () => {
  if (isLoggedIn()) return Promise.resolve();
  if (_loginPromise) return _loginPromise;

  _loginPromise = _doLogin()
    .catch((err: unknown) => {
      clearAuth();
      throw err;
    })
    .finally(() => {
      _loginPromise = null;
    });
  return _loginPromise;
};

const _doLogin = async () => {
  log.info('开始登录');

  const { code } = await wxLogin();

  const response = await authService.login({ code });

  // 解构返回的数据（ResultLoginVO.data）
  const { token, userInfo } = response;

  // 1. 保存到持久化存储
  saveToken(token);
  storage.set(STORAGE_KEYS.USER_INFO, userInfo);

  // 2. 更新到store（运行时状态）
  appStore.setState({
    token,
    userInfo,
  });

  eventBus.emit(EVENTS.LOGIN_SUCCESS);
  log.info('登录成功', { userId: userInfo.id, role: userInfo.role });
};

registerAuthRefreshHandler(async (failedToken) => {
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
  const token = storage.get(STORAGE_KEYS.TOKEN);
  const userInfo = storage.get(STORAGE_KEYS.USER_INFO);

  if (token && userInfo) {
    appStore.setState({ token, userInfo });
    eventBus.emit(EVENTS.LOGIN_SUCCESS);
    log.info('从storage恢复用户信息', { userId: userInfo.id, role: userInfo.role });
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

export const logout = () => {
  clearAuth();
  eventBus.emit(EVENTS.LOGOUT);
  // wx.reLaunch({ url: '/pages/login/login' });
};
