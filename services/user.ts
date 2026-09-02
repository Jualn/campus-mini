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

import { api } from './api';
import { createLogger } from '../utils/logger';
import type {
  EditProfileForm,
  EditProfileUpdate,
  Settings,
  UserProfileInfo,
} from '../types/business';
import type {
  UserAgreementStatusVO,
  UserProfileUpdateRequest,
  UserProfileVO,
  UserPublicProfileVO,
  UserSettingUpdateRequest,
  UserSettingVO,
} from '../types/api';
import { formatTime, TimeStyle } from '../utils/time-util';

const log = createLogger('UserService');

const toProfileInfo = (profile: UserProfileVO): UserProfileInfo => ({
  id: profile.id,
  nickname: profile.nickname,
  avatarUrl: profile.avatarUrl,
  bannerUrl: profile.backgroundUrl,
  bio: profile.bio,
  verified: profile.status === 1,
  joinYear: formatTime(profile.createdAt, TimeStyle.YM),
  role: profile.role,
});

const toPublicProfileInfo = (profile: UserPublicProfileVO): UserProfileInfo => ({
  nickname: profile.nickname,
  avatarUrl: profile.avatarUrl || '',
  bannerUrl: profile.backgroundUrl,
  bio: profile.bio,
  verified: true,
  joinYear: formatTime(profile.createdAt, TimeStyle.YM),
});

export const toEditProfileForm = (profile: UserProfileInfo): EditProfileForm => ({
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
export const updateUserInfo = async (data: EditProfileUpdate): Promise<UserProfileInfo> => {
  const payload: UserProfileUpdateRequest = {};

  if (data.nickname !== undefined) {
    payload.nickname = data.nickname;
  }

  if (data.avatarUrl !== undefined) {
    payload.avatarUrl = data.avatarUrl;
  }

  if (data.avatarObjectKey !== undefined) {
    payload.avatarObjectKey = data.avatarObjectKey;
  }

  if (data.bannerUrl !== undefined) {
    payload.backgroundUrl = data.bannerUrl;
  }

  if (data.backgroundObjectKey !== undefined) {
    payload.backgroundObjectKey = data.backgroundObjectKey;
  }

  if (data.bio !== undefined) {
    payload.bio = data.bio;
  }

  // 没有可更新字段时只读取资料，不发送空 PUT。
  if (Object.keys(payload).length === 0) {
    return getCurrentProfile();
  }

  return toProfileInfo(await api.user.updateCurrentProfile(payload));
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
  return mapSettings(await api.setting.get());
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
