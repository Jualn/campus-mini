// userStore.ts

import storage, { STORAGE_KEYS } from '../utils/storage';
import store from '../stores/index';
import { postService, userService } from '../services/index';
import type { MePageData, EditProfileForm } from '../types/business';
import type { UserInfoDTO } from '../types/api';
import { getUserInfo } from './helper';

const updateLocalUserInfo = (patch: Partial<UserInfoDTO>): void => {
  const current = store.get('userInfo');

  if (!current) return;

  const nextUserInfo = {
    ...current,
    ...patch,
  };

  store.set('userInfo', nextUserInfo);
  storage.set(STORAGE_KEYS.USER_INFO, nextUserInfo);
};

const saveEditProfileAndSync = async (data: Partial<EditProfileForm>): Promise<void> => {
  const payload = await userService.updateUserInfo(data);

  const patch: Partial<UserInfoDTO> = {};

  if (payload.nickname !== undefined) {
    patch.nickname = payload.nickname;
  }

  if (payload.avatarUrl !== undefined) {
    patch.avatarUrl = payload.avatarUrl;
  }

  // 如果本地 userInfo 里后续也维护 backgroundUrl / bio，可以放开
  // if (payload.backgroundUrl !== undefined) {
  //   patch.backgroundUrl = payload.backgroundUrl;
  // }

  // if (payload.bio !== undefined) {
  //   patch.bio = payload.bio;
  // }

  if (Object.keys(patch).length > 0) {
    updateLocalUserInfo(patch);
  }
};

/**
 * 获取当前用户的个人主页数据，包括用户信息、帖子列表和当前激活的标签页
 * 且自动更新本地 userInfo 确保数据同步
 *
 * @returns Promise<MePageData>
 */
const getMePageDataAsync = async (): Promise<MePageData> => {
  let userId = getUserInfo('id');
  if (!userId) {
    const user = storage.get(STORAGE_KEYS.USER_INFO) as UserInfoDTO | null;
    if (!user) {
      return Promise.reject(new Error('用户未登录'));
    }
    userId = user.id;
  }
  const [profile, postsResult] = await Promise.all([
    userService.getCurrentProfile(),
    postService.getUserPosts(userId, { pageSize: 20 }),
  ]);

  const patch: Partial<UserInfoDTO> = {};

  patch.nickname = profile.nickname;
  patch.role = profile.role;
  if (profile.avatarUrl !== undefined) {
    patch.avatarUrl = profile.avatarUrl;
  }

  if (Object.keys(patch).length > 0) {
    updateLocalUserInfo(patch);
  }

  return {
    userInfo: { ...profile, id: userId },
    posts: postsResult.list,
    activeTab: 'posts',
  };
};

export default {
  saveEditProfileAndSync,
  getMePageDataAsync,
};
