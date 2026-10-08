// storage.ts
import type { Settings } from '../types/business';
import { createLogger } from './logger';
import { wxGetStorageSync } from './wx-promise';
import type { UserInfoDTO } from '../types/api';

export type RegistrationReusablePurpose = 'NAME' | 'STUDENT_NUMBER' | 'CLASS' | 'PHONE';

export interface RegistrationFieldCandidateProfile {
  version: 1;
  userId: string;
  updatedAt: number;
  values: Partial<Record<RegistrationReusablePurpose, { value: string; updatedAt: number }[]>>;
}

/**
 * Storage 封装（基于 wx 本地存储）
 *
 * 用于统一管理微信小程序本地存储能力（wx.getStorageSync 等），
 * 提供：
 * - 安全读写（异常兜底）
 * - 默认值支持
 * - 统一日志记录
 * - 过期数据封装能力
 *
 * ⚠️ 特性说明：
 * - 数据持久化（关闭小程序仍存在）
 * - 不具备响应式能力（不会触发 UI 更新）
 * - 存储容量有限（适合轻量数据）
 *
 * 推荐用途：
 * - token / session
 * - 用户偏好配置
 * - 明确需要跨启动保留的轻量缓存
 *
 * ========== 项目中应该保存的key ==========
 * token           - JWT或其他认证token
 * userInfo        - 用户基础信息（id, name, avatar, role等）
 *
 * ❌ 不应该存储在这里：
 * - 页面 UI 状态 → 页面自身或专用运行时 Store
 * - 临时业务同步数据 → 对应领域的运行时 Store
 */

const log = createLogger('Storage');

interface StorageSchema {
  token: string;
  userInfo: UserInfoDTO;
  userSetting: Settings;
  searchHistory: string[];
  registrationFieldCandidates: RegistrationFieldCandidateProfile;
}

type StorageKey = keyof StorageSchema;

export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_INFO: 'userInfo',
  USER_SETTING: 'userSetting',
  SEARCH_HISTORY: 'searchHistory',
  REGISTRATION_FIELD_CANDIDATES: 'registrationFieldCandidates',
} as const satisfies Record<string, StorageKey>;

interface ExpiringStorage<T extends StorageKey> {
  value: StorageSchema[T];
  expiry: number; // 过期时间戳（ms）
}

export const storage = {
  /**
   * 获取存储数据
   *
   * @param {K} key 存储key
   * @returns {StorageSchema[K] | undefined} 存储值或 null（未命中）
   */
  get<K extends StorageKey>(key: K): StorageSchema[K] | undefined {
    try {
      const val = wxGetStorageSync(key) as StorageSchema[K] | undefined | null;

      return val !== '' && val !== null && val !== undefined ? val : undefined;
    } catch (e) {
      log.error('get', `get失败 key=${key}`, e);
      return undefined;
    }
  },

  /**
   * 设置存储数据
   *
   * @param {K} key 存储key
   * @param {StorageSchema[K] | ExpiringStorage<K>} value 存储值
   * @returns {boolean} 是否成功
   */
  set<K extends StorageKey>(key: K, value: StorageSchema[K] | ExpiringStorage<K>): boolean {
    try {
      wx.setStorageSync(key, value);
      return true;
    } catch (e) {
      log.error('set', `set失败 key=${key}`, e);
      return false;
    }
  },

  /**
   * 删除指定 key
   *
   * @param {K} key 存储key
   * @returns {boolean}
   */
  remove(key: StorageKey): boolean {
    try {
      wx.removeStorageSync(key);
      return true;
    } catch (e) {
      log.error('remove', `remove失败 key=${key}`, e);
      return false;
    }
  },

  /**
   * 清空所有本地存储
   *
   * ⚠️ 慎用：会清除所有 key
   *
   * @returns {boolean}
   */
  clear(): boolean {
    try {
      wx.clearStorageSync();
      return true;
    } catch (e) {
      log.error('clear', 'clear失败', e);
      return false;
    }
  },

  /**
   * 设置带过期时间的数据
   *
   * 存储结构：
   * {
   *   value: 真实数据,
   *   expiry: 过期时间戳（ms）
   * }
   *
   * @param {K} key 存储key
   * @param {StorageSchema[K]} value 数据值
   * @param {number} ttlMs 过期时间（毫秒）
   */
  setWithExpiry<K extends StorageKey>(key: K, value: StorageSchema[K], ttlMs: number) {
    this.set(key, {
      value,
      expiry: Date.now() + ttlMs,
    });
  },

  /**
   * 获取带过期时间的数据
   *
   * 逻辑：
   * - 未命中：返回 undefined
   * - 已过期：自动删除并返回 undefined
   * - 未过期：返回 value
   *
   * @param {K} key 存储key
   * @returns {StorageSchema[K] | undefined} 存储值或 undefined（未命中或已过期）
   */
  getWithExpiry<K extends StorageKey>(key: K): StorageSchema[K] | undefined {
    const item = this.get(key) as ExpiringStorage<K> | undefined;

    if (!item) return undefined;

    // 过期判断
    if (Date.now() > item.expiry) {
      this.remove(key);
      return undefined;
    }

    return item.value;
  },
};
