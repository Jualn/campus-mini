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

export const searchActivities = (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => searchService.searchActivities(query);
