import * as userService from '../services/user';
import * as postAction from './post';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { appStore } from '../stores/index';
import type {
  EditProfileForm,
  EditProfileUpdate,
  MePageData,
  Settings,
  UserPageData,
} from '../types/business';
import type { UserSettingUpdateRequest } from '../types/api';
import { getUserInfo } from '../stores/helper';
import { getCurrentProfile, peekCurrentProfile, saveCurrentProfile } from './current-user';

type NotifyKey = keyof Settings['notify'];

const NOTIFY_FIELD_MAP: Record<NotifyKey, (keyof UserSettingUpdateRequest)[]> = {
  activity: ['notifyActivityRemind'],
  exam: ['notifyExamRemind'],
  interaction: ['notifyComment', 'notifyReply', 'notifyLike'],
  system: ['notifySystem'],
  audit: ['notifyAuditResult'],
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
  const profile = await getCurrentProfile();
  return toEditProfileForm(profile);
};

export const saveEditProfileAndSync = async (data: EditProfileUpdate): Promise<void> => {
  await saveCurrentProfile(data);
};

export const getMePageData = async (options: { force?: boolean } = {}): Promise<MePageData> => {
  const profile = await getCurrentProfile(options);
  const userId = profile.id;
  if (!userId) throw new Error('用户资料缺少身份信息');
  const postsResult = await postAction.getUserPosts(userId, { pageSize: 20 });
  if (getUserInfo('id') !== userId) throw new Error('登录状态已变化，请重试');

  return {
    userInfo: peekCurrentProfile() ?? profile,
    posts: postsResult.list,
    activeTab: 'posts',
  };
};

export const getUserPageData = async (
  userId: string,
  options: { force?: boolean } = {},
): Promise<UserPageData> => {
  if (userId === getUserInfo('id')) return getMePageData(options);
  const [profile, postsResult] = await Promise.all([
    userService.getPublicProfile(userId),
    postAction.getUserPosts(userId, { pageSize: 20 }),
  ]);

  const current = peekCurrentProfile();
  return {
    userInfo: current?.id === userId ? current : { ...profile, id: userId },
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
