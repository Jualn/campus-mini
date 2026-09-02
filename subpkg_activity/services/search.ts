import type { ActivityCard, ServiceCursorPage } from '../../types/business';
import { api } from '../../services/api';
import { toCard } from './activity-mapper';

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
