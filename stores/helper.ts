import { appStore, createDefaultUserSettings } from './index';
import type { UserInfoDTO } from '../types/api';

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
