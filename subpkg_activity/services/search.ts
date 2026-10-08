import type { ActivityCard, ServiceCursorPage } from '../../types/business';
import { getActivityList } from './activity';

export const searchActivities = async (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => {
  return getActivityList({
    keyword: query.keyword,
    lastId: query.lastId,
    pageSize: query.pageSize,
  });
};
