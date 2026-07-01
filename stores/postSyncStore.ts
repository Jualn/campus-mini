// postSyncStore.ts

interface PostSyncPatch {
  id: string;
  isLiked?: boolean;
  likeCount?: number;
  commentCount?: number;
  viewCount?: number;
  updatedAt?: number;
  expiresAt?: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;

class PostSyncStore {
  private map = new Map<string, PostSyncPatch>();

  private pruneExpired(now = Date.now()) {
    for (const [id, item] of this.map) {
      if (item.expiresAt && item.expiresAt <= now) {
        this.map.delete(id);
      }
    }
  }

  private pruneOverflow() {
    if (this.map.size <= MAX_ENTRIES) return;
    const entries = Array.from(this.map.values()).sort((a, b) => {
      const aTime = a.updatedAt ?? 0;
      const bTime = b.updatedAt ?? 0;
      return aTime - bTime;
    });
    const removeCount = this.map.size - MAX_ENTRIES;
    for (let i = 0; i < removeCount; i += 1) {
      const id = entries[i]?.id;
      if (id) this.map.delete(id);
    }
  }

  set(patch: Omit<PostSyncPatch, 'updatedAt' | 'expiresAt'>, opts?: { ttlMs?: number }) {
    const now = Date.now();
    this.pruneExpired(now);

    const id = patch.id || '';
    if (!id) return;

    const prev = this.map.get(id);
    const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    const next: PostSyncPatch = {
      ...prev,
      ...patch,
      id,
      updatedAt: now,
      expiresAt: now + Math.max(1000, ttlMs),
    };

    this.map.set(id, next);
    this.pruneOverflow();
    return next;
  }

  get(id: string) {
    const key = id || '';
    if (!key) return undefined;
    const item = this.map.get(key);
    if (!item) return undefined;
    const now = Date.now();
    if (item.expiresAt && item.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    return item;
  }

  clear(id?: string) {
    if (id) {
      this.map.delete(id);
      return;
    }
    this.map.clear();
  }

  has(id: string) {
    return !!this.get(id);
  }

  size() {
    this.pruneExpired();
    return this.map.size;
  }
}

export const postSyncStore = new PostSyncStore();
export type { PostSyncPatch };
