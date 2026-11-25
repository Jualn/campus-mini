import { resolvePostType } from '../../utils/post-policy';
import type { ActivityCard, PostCardItem, ServiceCursorPage } from '../../types/business';
import { api } from '../../services/api';
import { mapPostListItem } from '../../services/post';
import { toCard } from './activity-card-mapper';
import { eventApi } from './event-api';

export const searchPosts = async (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<PostCardItem>> => {
  const res = await api.search.searchPosts(query);
  return {
    hasMore: res.hasMore,
    list: res.list
      .filter((item) => resolvePostType(item.postType) === 'NORMAL')
      .map(mapPostListItem),
    nextCursor: res.nextCursor ?? undefined,
  };
};

export const searchActivities = async (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => {
  const res = await eventApi.activities.list({
    q: query.keyword.trim(),
    cursor: query.lastId,
    pageSize: query.pageSize,
    sort: '-publishedAt',
    lifecycleStatus: 'ACTIVE',
    audienceFilter: 'ALL',
  });
  return {
    hasMore: Boolean(res.nextCursor),
    list: res.items.map(toCard),
    nextCursor: res.nextCursor ?? undefined,
  };
};
