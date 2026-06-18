// helper.ts
/**
 * Store 助手方法
 *
 * 提供高级API来简化常见操作
 *
 * 注：当前后端实现只返回 token + userInfo
 * userInfo.role: 1=用户, 2=运营, 3=管理员
 */

import store from './index';
import storage from '../utils/storage';
import type { UserInfoDTO } from '../types/api';

/**
 * 角色常量
 */
export const ROLES = {
  USER: 1, // 普通用户
  OPERATOR: 2, // 运营
  ADMIN: 3, // 管理员
};

/**
 * 检查用户角色
 * @param {number|number[]} role - 需要检查的角色ID或角色数组
 * @returns {boolean}
 *
 * @example
 * hasRole(ROLES.ADMIN)                    // 检查是否是管理员
 * hasRole([ROLES.ADMIN, ROLES.OPERATOR])  // 检查是否是管理员或运营
 */
export const hasRole = (role: number | number[]): boolean => {
  const userInfo = store.get('userInfo');
  if (!userInfo) return false;

  if (Array.isArray(role)) {
    // 检查是否包含任意一个角色（OR逻辑）
    return role.includes(userInfo.role);
  }

  return userInfo.role === role;
};

/**
 * 检查是否是管理员
 */
export const isAdmin = () => {
  return hasRole(ROLES.ADMIN);
};

/**
 * 检查是否是运营
 */
export const isOperator = () => {
  return hasRole(ROLES.OPERATOR);
};

/**
 * 检查是否是普通用户
 */
export const isUser = () => {
  return hasRole(ROLES.USER);
};

/**
 * 获取用户信息字段
 * @param {string} field - 字段名
 * @returns {*}
 * @example getUserInfo('id')    // 获取用户ID
getUserInfo('name')  // 获取用户名
getUserInfo('role')  // 获取用户角色(1/2/3)
 */
export const getUserInfo = <K extends keyof UserInfoDTO>(field: K): UserInfoDTO[K] | null => {
  const userInfo = store.get('userInfo');
  return userInfo?.[field] ?? null;
};

/**
 * 检查是否已登录
 * @returns {boolean}
 */
export const isLoggedIn = (): boolean => {
  return !!store.get('token') && !!store.get('userInfo');
};

/**
 * 获取登录用户ID
 * @returns {string|null}
 */
export const getUserId = (): string | null => {
  return getUserInfo('id');
};

/**
 * 批量同步storage到store
 * 用于从storage恢复数据
 */
export const syncStorageToStore = () => {
  const token = storage.get('token');
  const userInfo = storage.get('userInfo');
  const userSetting = storage.get('userSetting');

  store.setState({
    token,
    userInfo,
    userSetting,
  });
};

/**
 * 清空用户相关的所有状态
 */
export const clearUserState = () => {
  store.setState({
    token: '',
    userInfo: {
      id: '',
      nickname: '',
      avatarUrl: '',
      role: 0,
    },
  });
};

export default {
  // 角色检查
  hasRole,
  isAdmin,
  isOperator,
  isUser,

  // 用户信息
  getUserInfo,
  getUserId,

  // 登录状态
  isLoggedIn,
  syncStorageToStore,
  clearUserState,

  // 角色常量
  ROLES,
};
