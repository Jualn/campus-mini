// auth.ts
import api from './api';
import { wxLogin } from '../utils/wx-promise';
import storage from '../utils/storage';
import store from '../store/index';
import { clearUserState } from '../store/helper';
import createLogger from '../utils/logger';
// import eventBus, { EVENTS } from '../utils/event-bus';
import type { UserInfoDTO } from '../types/api';

const log = createLogger('AuthService');

let _loginPromise: Promise<void> | null = null; // 防并发

let _authReadyResolve: () => void;
export const authReady = new Promise<void>((resolve) => {
  _authReadyResolve = resolve;
});

export const getToken = () => storage.get('token');
export const saveToken = (token: string) => storage.set('token', token);
export const clearAuth = () => {
  storage.remove('token');
  storage.remove('userInfo');
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

  _loginPromise = _doLogin().finally(() => {
    _loginPromise = null;
  });
  return _loginPromise;
};

const _doLogin = async () => {
  log.info('开始登录');

  const { code } = await wxLogin();

  const response = await api.auth.login({ code });
  console.log(666)
  // 解构返回的数据（ResultLoginVO.data）
  const { token, userInfo } = response;

  // 1. 保存到持久化存储
  saveToken(token);
  storage.set('userInfo', userInfo);

  // 2. 更新到store（运行时状态）
  store.setState({
    token,
    userInfo,
  });

  // eventBus.emit(EVENTS.LOGIN_SUCCESS, userInfo);
  log.info('登录成功', { userId: userInfo.id, role: userInfo.role });
};

/**
 * 初始化用户信息（App启动时调用）
 * 从storage恢复登录状态
 */
export const initUserInfo = async (): Promise<void> => {
  const token = storage.get('token') as string | null;
  const userInfo = storage.get('userInfo') as UserInfoDTO | null;

  if (token && userInfo) {
    store.setState({ token, userInfo });
    log.info('从storage恢复用户信息', { userId: userInfo.id, role: userInfo.role });
    _authReadyResolve(); // ✅ 通知就绪
    return Promise.resolve();
  } else {
    try {
      await _doLogin();
      _authReadyResolve(); // ✅ 登录成功后通知就绪
    } catch (err) {
      log.error('自动登录失败', err);
      clearAuth();
      _authReadyResolve(); // ⚠️ 失败也要 resolve，否则页面永久挂起
    }
  }
};

export const logout = () => {
  clearAuth();
  // eventBus.emit(EVENTS.LOGOUT);
  // wx.reLaunch({ url: '/pages/login/login' });
};
