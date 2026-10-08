// user.ts
/**
 * 用户服务 (User Service)
 *
 * 对齐 OpenAPI 中的：
 * - GET /v1/users/me/profile
 * - POST /v1/users/me/profile
 * - GET /v1/users/{userId}/profile
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
import type { UserAgreementStatusVO, UserSettingUpdateRequest, UserSettingVO } from '../types/api';
import type { UserProfile } from '../types/profile-contract';
import { getErrorMessage } from '../utils/notify';
import { HttpError } from '../utils/error';

const log = createLogger('UserService');

function toProfileInfo(value: unknown): UserProfileInfo {
  if (!value || typeof value !== 'object')
    throw new HttpError(502, 'Invalid canonical Profile response');
  const profile = value as Partial<UserProfile>;
  if (
    typeof profile.userId !== 'string' ||
    !profile.userId.trim() ||
    typeof profile.nickname !== 'string' ||
    typeof profile.bio !== 'string' ||
    !(profile.avatarUrl === null || typeof profile.avatarUrl === 'string') ||
    !(profile.backgroundUrl === null || typeof profile.backgroundUrl === 'string') ||
    typeof profile.isPlatformOperator !== 'boolean'
  ) {
    throw new HttpError(502, 'Invalid canonical Profile response', {
      userMessage: '资料响应异常，请稍后重试',
    });
  }
  // Discard unknown properties; none are permissions.
  return {
    userId: profile.userId,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl,
    backgroundUrl: profile.backgroundUrl,
    bio: profile.bio,
    isPlatformOperator: profile.isPlatformOperator,
  };
}

export const toEditProfileForm = (profile: UserProfileInfo): EditProfileForm => ({
  nickname: profile.nickname,
  bio: profile.bio,
  avatarUrl: profile.avatarUrl ?? '',
  backgroundUrl: profile.backgroundUrl ?? '',
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

export function getProfileErrorMessage(error: unknown): string {
  if (error instanceof HttpError && error.statusCode === 404) return '用户不存在或暂不可查看';
  return getErrorMessage(error, '资料加载失败，请稍后重试');
}

/** Canonical reads; no fallback to legacy wire semantics. */
export const getCurrentProfile = async (): Promise<UserProfileInfo> =>
  toProfileInfo(await api.user.getCurrentProfile());

export const getPublicProfile = async (userId: string): Promise<UserProfileInfo> => {
  if (!userId) throw new Error('userId不能为空');
  const profile = toProfileInfo(await api.user.getPublicProfile(userId));
  if (profile.userId !== userId) throw new HttpError(502, 'Profile identity mismatch');
  return profile;
};

export const getEditProfileForm = async (): Promise<EditProfileForm> =>
  toEditProfileForm(await getCurrentProfile());

export const saveEditProfile = async (data: EditProfileUpdate): Promise<void> => {
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

/** Partial update: whitelist only fields accepted by UpdateMyProfileRequest. */
export const updateUserInfo = async (data: EditProfileUpdate): Promise<UserProfileInfo> => {
  const payload: EditProfileUpdate = {};
  if (data.nickname !== undefined) payload.nickname = data.nickname;
  if (data.bio !== undefined) payload.bio = data.bio;
  if (data.avatarObjectKey !== undefined) payload.avatarObjectKey = data.avatarObjectKey;
  if (data.backgroundObjectKey !== undefined)
    payload.backgroundObjectKey = data.backgroundObjectKey;
  if (!Object.keys(payload).length) return getCurrentProfile();
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
