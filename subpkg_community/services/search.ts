import type { ActivityCard, PostCardItem, ServiceCursorPage } from '../../types/business';
import { api } from '../../services/api';
import { mapPostListItem } from '../../services/post';
import { toCard } from './activity-mapper';

export const searchPosts = async (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<PostCardItem>> => {
  const res = await api.search.searchPosts(query);
  return {
    hasMore: res.hasMore,
    list: res.list.map(mapPostListItem),
    nextCursor: res.nextCursor,
  };
};

export const searchActivities = async (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => {
  const res = await api.search.searchActivities(query);
  return {
    hasMore: res.hasMore,
    list: res.list.map(toCard),
    nextCursor: res.nextCursor,
  };
};
