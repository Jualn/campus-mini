import { ensureLogin } from '../../actions/auth';
import { getUserId } from '../../stores/helper';
import * as searchService from '../services/search';
import type { ActivityCard, PostCardItem, ServiceCursorPage } from '../../types/business';
import { addSearchHistory } from '../utils/search-history';

export const recordSearchKeyword = (keyword: string): void => {
  const value = keyword.trim();
  if (!value) return;
  addSearchHistory(value);
};

export const searchPosts = (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<PostCardItem>> => searchService.searchPosts(query);

export const searchActivities = async (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => {
  await ensureLogin();
  const userId = getUserId();
  if (!userId) throw new Error('登录状态不可用，请重试');
  const result = await searchService.searchActivities(query);
  if (getUserId() !== userId) throw new Error('登录状态已变化，请重试');
  return result;
};
