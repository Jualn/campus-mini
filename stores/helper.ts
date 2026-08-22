import { appStore, createDefaultUserSettings } from './index';
import type { UserInfoDTO } from '../types/api';

export const ROLES = {
  USER: 1,
  OPERATOR: 2,
  ADMIN: 3,
} as const;

export const hasRole = (role: number | number[]): boolean => {
  const userInfo = appStore.get('userInfo');

  if (Array.isArray(role)) {
    return role.includes(userInfo.role);
  }

  return userInfo.role === role;
};

export const isAdmin = () => hasRole(ROLES.ADMIN);

export const isOperator = () => hasRole(ROLES.OPERATOR);

export const isUser = () => hasRole(ROLES.USER);

export const getUserInfo = <K extends keyof UserInfoDTO>(field: K): UserInfoDTO[K] | null => {
  return appStore.get('userInfo')[field] || null;
};

export const isLoggedIn = (): boolean => {
  return !!appStore.get('token') && !!getUserInfo('id');
};

export const getUserId = (): string | null => {
  return getUserInfo('id');
};

export const clearUserState = () => {
  appStore.setState({
    token: '',
    userInfo: {
      id: '',
      nickname: '',
      avatarUrl: '',
      role: 0,
    },
    userSetting: createDefaultUserSettings(),
  });
};
