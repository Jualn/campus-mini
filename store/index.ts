// index.ts
/**
 * Store（轻量状态管理）
 *
 * 用于管理全局共享状态，并支持响应式订阅机制。
 *
 * 核心思想：
 * - state：存储全局状态（内存）
 * - set：修改状态并触发更新
 * - get：读取状态
 * - watch：监听某个 key 的变化
 *
 * ⚠️ 特点说明：
 * - 仅运行时有效（刷新会丢失）
 * - 需要结合 wx.storage 做持久化
 * - 不支持深层自动响应（仅 key 级别）
 *
 * 推荐用途：
 * - userInfo
 * - token
 * - cartCount
 * - UI 状态（tab / badge / theme）
 *
 * 不推荐用途：
 * - 大型复杂对象深层变更（建议拆分 key）
 */

import type { Settings } from '../types/business';
import type { UserInfoDTO } from '../types/api';

// ✅ 1. 定义 State 结构
interface AppState {
  token?: string;
  userInfo?: UserInfoDTO;
  selectedTabIndex?: number;
  badgeCount?: number;
  cartCount?: number;
  userSetting?: Settings;
}

// ✅ 2. 订阅回调类型
type Listener<T = unknown> = (value: T) => void;

// ✅ 3. Store 用泛型约束 S，key 自动推断为 keyof S
class Store<S extends object> {
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
    for (const key in patch) {
      this.set(key, patch[key] as S[keyof S]);
    }
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

// 4. wx 类型（微信小程序全局已有 @types/miniprogram-api-typings，此处仅兜底声明）
declare const wx: { getStorageSync: (key: string) => string };

export default new Store<AppState>({
  /**
   * ========== 认证相关 ==========
   */
  token: wx.getStorageSync('token') || '',

  userInfo: {
    id: '',
    nickname: '',
    avatarUrl: '',
    role: 0,
  }, // { id, name, avatar, role(1=用户,2=运营,3=管理员), ... }

  userSetting: {
    notify: {
      activity: false,
      exam: false,
      interaction: false,
      system: false,
      audit: false,
    },
  },
  /**
   * ========== UI状态 ==========
   * 运行时状态，页面刷新后丢失
   */
  selectedTabIndex: 0, // 当前选中的tabbar索引

  /**
   * ========== 其他状态 ==========
   */
  badgeCount: 0, // 消息/通知角标数
  cartCount: 0,
});
