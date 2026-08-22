import { userService } from '../services/index';
import * as postAction from './post';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { appStore } from '../stores/index';
import type { EditProfileForm, MePageData, Settings, UserPageData } from '../types/business';
import type { UserInfoDTO, UserSettingUpdateRequest } from '../types/api';
import { getUserInfo } from '../stores/helper';

type NotifyKey = keyof Settings['notify'];

const NOTIFY_FIELD_MAP: Record<NotifyKey, (keyof UserSettingUpdateRequest)[]> = {
  activity: ['notifyActivityRemind'],
  exam: ['notifyExamRemind'],
  interaction: ['notifyComment', 'notifyReply', 'notifyLike'],
  system: ['notifySystem'],
  audit: ['notifyAuditResult'],
};

const updateLocalUserInfo = (patch: Partial<UserInfoDTO>): void => {
  const current = appStore.get('userInfo');

  const nextUserInfo = {
    ...current,
    ...patch,
  };

  appStore.set('userInfo', nextUserInfo);
  storage.set(STORAGE_KEYS.USER_INFO, nextUserInfo);
};

const toEditProfileForm = (profile: {
  nickname?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
}): EditProfileForm => ({
  nickname: profile.nickname ?? '',
  bio: profile.bio ?? '',
  avatarUrl: profile.avatarUrl ?? '',
  bannerUrl: profile.bannerUrl ?? '',
});

export const getEditProfileForm = async (): Promise<EditProfileForm> => {
  const profile = await userService.getCurrentProfile();
  return toEditProfileForm(profile);
};

export const saveEditProfileAndSync = async (data: Partial<EditProfileForm>): Promise<void> => {
  const payload = await userService.updateUserInfo(data);

  const patch: Partial<UserInfoDTO> = {};

  if (payload.nickname !== undefined) {
    patch.nickname = payload.nickname;
  }

  if (payload.avatarUrl !== undefined) {
    patch.avatarUrl = payload.avatarUrl;
  }

  if (Object.keys(patch).length > 0) {
    updateLocalUserInfo(patch);
  }
};

export const getMePageData = async (): Promise<MePageData> => {
  let userId = getUserInfo('id');
  if (!userId) {
    const user = storage.get(STORAGE_KEYS.USER_INFO);
    if (!user) {
      return Promise.reject(new Error('user not logged in'));
    }
    userId = user.id;
  }

  const [profile, postsResult] = await Promise.all([
    userService.getCurrentProfile(),
    postAction.getUserPosts(userId, { pageSize: 20 }),
  ]);

  const patch: Partial<UserInfoDTO> = {
    nickname: profile.nickname,
    role: profile.role,
  };

  if (profile.avatarUrl !== undefined) {
    patch.avatarUrl = profile.avatarUrl;
  }

  updateLocalUserInfo(patch);

  return {
    userInfo: { ...profile, id: userId },
    posts: postsResult.list,
    activeTab: 'posts',
  };
};

export const getUserPageData = async (userId: string): Promise<UserPageData> => {
  const [profile, postsResult] = await Promise.all([
    userService.getPublicProfile(userId),
    postAction.getUserPosts(userId, { pageSize: 20 }),
  ]);

  return {
    userInfo: { ...profile, id: userId },
    posts: postsResult.list,
    activeTab: 'posts',
  };
};

export const getUserSettings = async (): Promise<Settings> => {
  const cached = storage.get(STORAGE_KEYS.USER_SETTING);
  if (cached) {
    appStore.set('userSetting', cached);
    return cached;
  }

  const settings = await userService.getUserSettings();
  storage.set(STORAGE_KEYS.USER_SETTING, settings);
  appStore.set('userSetting', settings);
  return settings;
};

export const getCachedUserSettings = (): Settings | null => {
  return storage.get(STORAGE_KEYS.USER_SETTING) ?? null;
};

export const updateNotifySettingAndSync = async (
  key: NotifyKey,
  value: boolean,
  currentNotify: Settings['notify'],
): Promise<Settings> => {
  await userService.updateNotifySetting(key, value);

  const cached = storage.get(STORAGE_KEYS.USER_SETTING);
  const confirmedNotify = { ...(cached?.notify ?? currentNotify), [key]: value };
  const settings: Settings = { notify: confirmedNotify };

  storage.set(STORAGE_KEYS.USER_SETTING, settings);
  appStore.set('userSetting', settings);

  return settings;
};

export const buildNotifySettingPayload = (
  key: NotifyKey,
  value: boolean,
): Partial<UserSettingUpdateRequest> => {
  const payload: Partial<UserSettingUpdateRequest> = {};
  NOTIFY_FIELD_MAP[key].forEach((field) => {
    payload[field] = value;
  });
  return payload;
};
