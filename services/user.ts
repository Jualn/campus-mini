// user.ts
/**
 * 用户服务 (User Service)
 *
 * 对齐 OpenAPI 中的：
 * - /v1/users/me
 * - /v1/users/public/{userId}
 * - /v1/setting
 * - /v1/users/me/agreement
 *
 * 下列方法为当前项目的兼容/扩展能力，OpenAPI 文档中未列出：
 * - follower / following / stats / search
 */

import api from './api';
import postService from './post';
import storage from '../utils/storage';
import createLogger from '../utils/logger';
import type {
  EditProfileForm,
  MePageData,
  Settings,
  UserPageData,
  UserProfileInfo,
} from '../types/business';
import type {
  UserAgreementStatusVO,
  UserInfoDTO,
  UserProfileUpdateRequest,
  UserProfileVO,
  UserPublicProfileVO,
  UserSettingUpdateRequest,
  UserSettingVO,
} from '../types/api';
import formatTime, { TimeStyle } from '../utils/time-util';
import store from '../store/index';
import { getUserInfo } from '../store/helper';

const log = createLogger('UserService');

const toProfileInfo = (profile: UserProfileVO): UserProfileInfo => ({
  nickname: profile.nickname,
  avatarUrl: profile.avatarUrl || '',
  bannerUrl: profile.backgroundUrl,
  bio: profile.bio,
  verified: profile.status === 1,
  joinYear: formatTime(profile.createdAt, TimeStyle.YM),
});

const toPublicProfileInfo = (profile: UserPublicProfileVO): UserProfileInfo => ({
  nickname: profile.nickname,
  avatarUrl: profile.avatarUrl || '',
  bannerUrl: profile.backgroundUrl,
  bio: profile.bio,
  verified: true,
  joinYear: formatTime(profile.createdAt, TimeStyle.YM),
});

const toEditProfileForm = (profile: UserProfileInfo): EditProfileForm => ({
  nickname: profile.nickname || '',
  bio: profile.bio ?? '',
  avatarUrl: profile.avatarUrl ?? '',
  bannerUrl: profile.bannerUrl ?? '',
});

function mapSettings(settings: UserSettingVO): Settings {
  const interaction = settings.notifyComment && settings.notifyReply && settings.notifyLike;
  return {
    notify: {
      activity: settings.notifyActivityRemind,
      exam: settings.notifyExamRemind,
      interaction: interaction,
      system: settings.notifySystem,
      audit: settings.notifyAuditResult,
    },
  };
}

type NotifyKey = keyof Settings['notify'];

const NOTIFY_FIELD_MAP: Record<NotifyKey, (keyof UserSettingUpdateRequest)[]> = {
  activity: ['notifyActivityRemind'],
  exam: ['notifyExamRemind'],
  interaction: ['notifyComment', 'notifyReply', 'notifyLike'],
  system: ['notifySystem'],
  audit: ['notifyAuditResult'],
};

/**
 * 获取当前登录用户资料
 *
 * GET /v1/users/me
 *
 * 响应体: ResultUserProfileVO
 * {
 *   code: number,
 *   message: string,
 *   data: {
 *     nickname: string,
 *     avatarUrl: string,
 *     backgroundUrl: string,
 *     bio: string,
 *     gender: number,
 *     role: number,
 *     roleDesc: string,
 *     status: number,
 *     statusDesc: string,
 *     banned: boolean,
 *     muted: boolean,
 *     banReason: string,
 *     banExpireAt: string,
 *     capabilities: string[],
 *     createdAt: string
 *   }
 * }
 */
export const getCurrentProfile = async (): Promise<UserProfileInfo> => {
  const profile = await api.user.getCurrentProfile();
  return toProfileInfo(profile);
};

/**
 * 获取公开用户资料
 *
 * GET /v1/users/public/{userId}
 *
 * 响应体: ResultUserPublicProfileVO
 * {
 *   code: number,
 *   message: string,
 *   data: {
 *     id: number,
 *     nickname: string,
 *     avatarUrl: string,
 *     backgroundUrl: string,
 *     bio: string,
 *     gender: number
 *   }
 * }
 */
export const getPublicProfile = async (userId: string): Promise<UserProfileInfo> => {
  if (!userId) {
    return Promise.reject(new Error('userId不能为空'));
  }

  const profile = await api.user.getPublicProfile(userId);

  return toPublicProfileInfo(profile);
};

/**
 * 获取当前用户主页数据
 * 包含用户信息和相关帖子列表
 *
 * @returns 用户主页数据
 */
export const getMePageData = async (): Promise<MePageData> => {
  let userId = getUserInfo('id');
  if (!userId) {
    const user = storage.get('userInfo') as UserInfoDTO | null;
    if (!user) {
      return Promise.reject(new Error('用户未登录'));
    }
    userId = user.id;
  }
  const [profile, postsResult] = await Promise.all([
    getCurrentProfile(),
    postService.getUserPosts(userId, { pageSize: 20 }),
  ]);

  return {
    userInfo: { ...profile, id: userId },
    posts: postsResult.list,
    activeTab: 'posts',
  };
};

/**
 * 获取user页面中当前被查看用户信息，与该用户相关帖子
 *
 * @param userId 当前被查看用户id
 * @returns user页面数据
 */
export const getUserPageData = async (userId: string): Promise<UserPageData> => {
  const [profile, postsResult] = await Promise.all([
    getPublicProfile(userId),
    postService.getUserPosts(userId, { pageSize: 20 }),
  ]);

  return {
    userInfo: { ...profile, id: userId },
    posts: postsResult.list,
    activeTab: 'posts',
  };
};

// ************************************ 编辑资料相关 ************************************
export const getEditProfileForm = async (): Promise<EditProfileForm> => {
  const profile = await getCurrentProfile();
  return toEditProfileForm(profile);
};

export const saveEditProfile = async (data: EditProfileForm): Promise<void> => {
  await updateUserInfo(data);
};

/**
 * 绑定手机号
 * POST /v1/users/me/bind-phone?phone={phone}
 * @param phone 手机号
 * @returns Promise<void>
 */
export const bindPhone = async (phone: number): Promise<void> => {
  if (!phone) {
    return Promise.reject(new Error('phone不能为空'));
  }
  await api.user.bindPhone(phone);
};

/**
 * 更新用户信息
 * @param {Object} data - 用户信息数据
 * @returns {Promise}
 *
 * @example
 * updateUserInfo({
 *   nickname: '新昵称',
 *   avatar: 'https://...',
 *   bio: '个人签名'
 * })
 */
export const updateUserInfo = async (data: EditProfileForm): Promise<void> => {
  const payload: UserProfileUpdateRequest = {
    nickname: data.nickname ? data.nickname : undefined,
    avatarUrl: data.avatarUrl ? data.avatarUrl : undefined,
    backgroundUrl: data.bannerUrl ? data.bannerUrl : undefined,
    bio: data.bio ? data.bio : undefined,
    // gender: data.gender ? formValueToGender(data.gender) : undefined,
  };

  await api.user.updateCurrentProfile(payload);
  const userInfo = store.get('userInfo');
  if (userInfo) {
    userInfo.avatarUrl = payload.avatarUrl ?? userInfo.avatarUrl;
    userInfo.nickname = payload.nickname ?? userInfo.nickname;
    storage.set('userInfo', userInfo);
    store.set('userInfo', userInfo);
  }
};

/**
 * 获取当前用户设置
 *
 * GET /v1/setting
 *
 * 响应体: ResultUserSettingVO
 * {
 *   code: number,
 *   message: string,
 *   data: {
 *     notifyComment: boolean,
 *     notifyReply: boolean,
 *     notifyLike: boolean,
 *     notifyActivityRemind: boolean,
 *     notifyExamRemind: boolean,
 *     notifySystem: boolean,
 *     notifyAuditResult: boolean
 *   }
 * }
 */
export const getUserSettings = async (): Promise<Settings> => {
  let setting = storage.get('userSetting') as Settings | null;

  if (!setting) {
    setting = mapSettings(await api.setting.get());
    storage.set('userSetting', setting);
  }

  return setting;
};

/**
 * 更新当前用户设置
 *
 * PUT /v1/setting
 *
 * 请求体: UserSettingUpdateRequest
 * {
 *   notifyComment?: boolean,
 *   notifyReply?: boolean,
 *   notifyLike?: boolean,
 *   notifyActivityRemind?: boolean,
 *   notifyExamRemind?: boolean,
 *   notifySystem?: boolean,
 *   notifyAuditResult?: boolean
 * }
 *
 * 响应体: ResultString
 * {
 *   code: number,
 *   message: string,
 *   data: string,
 *   timestamp: number
 * }
 */
export const updateNotifySetting = async (key: NotifyKey, value: boolean): Promise<void> => {
  const payload: Partial<UserSettingUpdateRequest> = {};
  NOTIFY_FIELD_MAP[key].forEach((field) => {
    payload[field] = value;
  });

  await api.setting.update(payload);
};

/**
 * 用户协议状态
 * GET /v1/users/me/agreement
 */
export const getAgreementStatus = async (): Promise<UserAgreementStatusVO> => {
  try {
    return await api.user.getAgreementStatus();
  } catch (err) {
    log.error('getAgreementStatus', '获取用户协议状态失败', err);
    throw err;
  }
};

/**
 * 同意用户协议
 * POST /v1/users/me/agreement
 * 请求体: UserAgreementRequest { version: string }
 */
export const agreeAgreement = async (version: string) => {
  if (!version) {
    return Promise.reject(new Error('version不能为空'));
  }

  try {
    return await api.user.agreeAgreement({ version });
  } catch (err) {
    log.error('agreeAgreement', '同意用户协议失败', err);
    throw err;
  }
};

export default {
  getCurrentProfile,
  getPublicProfile,
  getUserInfo,
  getMePageData,
  getUserPageData,
  getEditProfileForm,
  updateUserInfo,
  saveEditProfile,
  updateNotifySetting,
  getUserSettings,
  getAgreementStatus,
  bindPhone,
  agreeAgreement,
};
