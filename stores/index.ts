/**
 * 应用级运行时状态。
 *
 * Store 不访问后端或 Storage。Action 负责初始化、持久化和清理状态；
 * 页面只通过 Action 或只读 helper 使用这些数据。
 */

import type { Settings, UserProfileInfo } from '../types/business';
import type { UserInfoDTO } from '../types/api';

// ✅ 1. 定义 State 结构
export interface AppState {
  token: string;
  userInfo: UserInfoDTO;
  /** 完整资料只缓存于本次会话；userInfo 保留为登录摘要的兼容投影。 */
  currentProfile: { profile: UserProfileInfo; fetchedAt: number } | null;
  userSetting: Settings;
}

type Listener<T = unknown> = (value: T) => void;

export class Store<S extends object> {
  private _state: S;
  private _listeners: Map<keyof S, Set<Listener>>;
  /**
   * @param {Object} initialState 初始状态
   */
  constructor(initialState: S) {
    /**
     * 内部状态容器
     * @private
     */
    this._state = initialState;

    /**
     * 监听器集合
     * key → Set<Function>
     * @private
     */
    this._listeners = new Map(); // key → Set<fn>
  }

  /**
   * 获取状态
   * @param {string} key 状态key
   * @returns {*}
   */
  get<K extends keyof S>(key: K): S[K] {
    return this._state[key];
  }

  /**
   * 设置状态（会触发订阅）
   *
   * @param {string} key 状态key
   * @param {*} value 新值
   */
  set<K extends keyof S>(key: K, value: S[K]): void {
    this._state[key] = value;
    // 触发订阅更新
    this._listeners.get(key)?.forEach((fn) => {
      fn(value);
    });
  }

  /**
   * 批量更新状态,（Partial 保证只能传已有 key）
   *
   * @param {Object} patch 多个 key-value
   */
  setState(patch: Partial<S>): void {
    (Object.keys(patch) as (keyof S)[]).forEach((key) => {
      const value = patch[key];

      if (value !== undefined) {
        this.set(key, value);
      }
    });
  }

  /**
   * 订阅某个 key 的变化
   *
   *
   * @example
   * // 销毁：
   * _unwatches: [] as Array<() => void>
   *
   * this._unwatches.push( store.watch(...), )
   *
   * onUnload() {
   *    this._unwatches.forEach(fn => fn()) // ✅ 一次性销毁全部
   * }
   *
   * @param {string} key 状态key
   * @param {Function} fn 回调函数（value变化时触发）
   * @returns {Function} 取消订阅函数,页面销毁时需要调用，不然内存泄露
   */
  watch<K extends keyof S>(key: K, fn: Listener<S[K]>): () => void {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());

    this._listeners.get(key)?.add(fn as Listener);

    fn(this._state[key]); // 立即执行一次，获取初始值

    // 返回取消订阅函数
    return () => this._listeners.get(key)?.delete(fn as Listener); // 返回取消订阅函数
  }
}

const defaultUserInfo: UserInfoDTO = {
  id: '',
  nickname: '',
  avatarUrl: '',
  role: 1,
};

export const createDefaultUserSettings = (): Settings => ({
  notify: {
    activity: false,
    exam: false,
    interaction: false,
    system: false,
    audit: false,
  },
});

export const appStore = new Store<AppState>({
  token: '',
  userInfo: defaultUserInfo,
  currentProfile: null,
  userSetting: createDefaultUserSettings(),
});
