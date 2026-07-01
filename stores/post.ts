// stores/post.ts

import { interactService } from '../services/index';
import { TARGET_TYPES } from '../utils/constants';
import createLogger from '../utils/logger';
import { emitPostUpdated } from '../events/post-event';
import { postSyncStore } from './postSyncStore';

const log = createLogger('postStore');

const VIEW_PATCH_TTL_MS = 10 * 60 * 1000;
const MAX_VIEWED_POSTS = 500;

class PostStore {
  private viewedPostIds = new Set<string>();

  private pruneOverflow() {
    if (this.viewedPostIds.size <= MAX_VIEWED_POSTS) return;

    const removeCount = this.viewedPostIds.size - MAX_VIEWED_POSTS;
    const ids = Array.from(this.viewedPostIds);

    for (let i = 0; i < removeCount; i += 1) {
      this.viewedPostIds.delete(ids[i]);
    }
  }

  hasViewed(postId: string) {
    return !!postId && this.viewedPostIds.has(postId);
  }

  /**
   * 记录帖子有效浏览。
   *
   * 轻量策略：
   * - 当前小程序会话内，同一帖子只上报一次；
   * - 本地先乐观 +1，接口失败不回滚；
   * - view 本身允许轻微不一致，避免反复重试打接口。
   */
  record(postId: string, currentViewCount?: number) {
    if (!postId || this.viewedPostIds.has(postId)) return false;

    this.viewedPostIds.add(postId);
    this.pruneOverflow();

    const cached = postSyncStore.get(postId);
    const baseCount = Math.max(
      typeof currentViewCount === 'number' ? currentViewCount : 0,
      typeof cached?.viewCount === 'number' ? cached.viewCount : 0,
    );

    const nextViewCount = Math.max(0, baseCount + 1);

    postSyncStore.set(
      {
        id: postId,
        viewCount: nextViewCount,
      },
      {
        ttlMs: VIEW_PATCH_TTL_MS,
      },
    );

    emitPostUpdated({
      id: postId,
      viewCount: nextViewCount,
    });

    interactService
      .reportView({
        targetType: TARGET_TYPES.POST.value,
        targetId: postId,
      })
      .catch((err: unknown) => {
        log.warn('record', '上报浏览失败', err);
      });

    return true;
  }

  clear() {
    this.viewedPostIds.clear();
  }
}

export const postStore = new PostStore();
