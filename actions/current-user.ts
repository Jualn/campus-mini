/** 当前用户资料的唯一读写入口；不管理帖子、评论或编辑草稿。 */
import * as userService from '../services/user';
import { appStore } from '../stores/index';
import { waitForAuthStable } from '../utils/auth-session';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { createLogger } from '../utils/logger';
import type { EditProfileUpdate, UserProfileInfo } from '../types/business';

export const PROFILE_TTL_MS = 5 * 60 * 1000;
const log = createLogger('CurrentUser');
let ownerId = '';
let generation = 0;
let revision = 0;
let reading: Promise<UserProfileInfo> | null = null;
let saving: Promise<UserProfileInfo> | null = null;

// 应用级监听与 Action 同寿命；logout 的空身份也会推进代次，阻止同账号重新登录后的旧响应。
appStore.watch('userInfo', (user) => {
  if (ownerId === user.id) return;
  ownerId = user.id;
  generation++;
  revision++;
  reading = null;
  saving = null;
  appStore.set('currentProfile', null);
});

export const peekCurrentProfile = (): UserProfileInfo | null =>
  appStore.get('currentProfile')?.profile ?? null;

/** 订阅不会发请求；适合输入栏、帖子等仅消费资料的组件。 */
export const watchCurrentProfile = (listener: (profile: UserProfileInfo | null) => void) =>
  appStore.watch('currentProfile', (cached) => {
    listener(cached?.profile ?? null);
  });

/** 登录摘要用于完整资料尚未加载时的输入栏占位，不覆盖接口返回的其他作者资料。 */
export const getCurrentIdentity = () => {
  const user = appStore.get('userInfo');
  const profile = peekCurrentProfile();
  return {
    id: user.id,
    nickname: profile?.nickname ?? user.nickname,
    avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
  };
};

export function watchCurrentIdentity(listener: () => void): () => void {
  let previous: ReturnType<typeof getCurrentIdentity> | null = null;
  const notify = () => {
    const next = getCurrentIdentity();
    if (
      previous?.id === next.id &&
      previous.nickname === next.nickname &&
      previous.avatarUrl === next.avatarUrl
    )
      return;
    previous = next;
    listener();
  };
  const offProfile = watchCurrentProfile(notify);
  const offLogin = appStore.watch('userInfo', notify);
  return () => {
    offProfile();
    offLogin();
  };
}

function commitProfile(profile: UserProfileInfo, userId: string): UserProfileInfo {
  if (profile.id !== userId) throw new Error('资料所属用户已变化，请重试');
  const user = appStore.get('userInfo');
  const summary = {
    ...user,
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl ?? '',
    role: profile.role ?? user.role,
  };
  appStore.set('currentProfile', { profile, fetchedAt: Date.now() });
  appStore.set('userInfo', summary);
  storage.set(STORAGE_KEYS.USER_INFO, summary);
  return profile;
}

export async function getCurrentProfile(
  options: { force?: boolean; allowStale?: boolean } = {},
): Promise<UserProfileInfo> {
  await waitForAuthStable();
  const userId = ownerId;
  if (!userId) throw new Error('请先登录');
  if (saving) return saving;
  const cached = appStore.get('currentProfile');
  if (!options.force && cached) {
    if (Date.now() - cached.fetchedAt < PROFILE_TTL_MS) return cached.profile;
    if (options.allowStale) {
      void getCurrentProfile({ force: true }).catch((err: unknown) => {
        log.warn('getCurrentProfile', '后台资料校验失败，保留现有展示', err);
      });
      return cached.profile;
    }
  }
  if (reading) return reading;
  const startedGeneration = generation;
  const startedRevision = revision;
  const task = userService.getCurrentProfile().then((profile) => {
    if (startedGeneration !== generation) throw new Error('登录状态已变化，请重试');
    // 旧 GET 不仅不能写 Store，也不能把旧资料交给页面。
    if (startedRevision !== revision) return getCurrentProfile();
    return commitProfile(profile, userId);
  });
  reading = task;
  try {
    return await task;
  } finally {
    if (reading === task) reading = null;
  }
}

export async function saveCurrentProfile(data: EditProfileUpdate): Promise<UserProfileInfo> {
  await waitForAuthStable();
  const userId = ownerId;
  if (!userId) throw new Error('请先登录');
  if (saving) throw new Error('资料正在保存，请稍候');
  const startedGeneration = generation;
  revision++;
  reading = null;
  const task = userService.updateUserInfo(data).then((profile) => {
    if (startedGeneration !== generation) throw new Error('登录状态已变化，请重新查看资料');
    return commitProfile(profile, userId);
  });
  saving = task;
  try {
    return await task;
  } finally {
    if (saving === task) saving = null;
  }
}
