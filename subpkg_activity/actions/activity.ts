import * as activityService from '../services/activity';
import { searchActivities as searchActivityList } from '../services/search';
import type { ActivityCreateRequest, ActivityPageQuery, ActivityUploadBO } from '../../types/api';
import type { ActivityCard, ServiceCursorPage } from '../../types/business';

export const createActivity = (payload: ActivityCreateRequest): Promise<string> =>
  activityService.create(payload);

export const getActivityList = (query?: ActivityPageQuery) =>
  activityService.getActivityList(query);

export const searchActivities = (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => searchActivityList(query);

export const getActivityDetail = (activityId: string) =>
  activityService.getActivityDetail(activityId);

export const uploadActivityAiFile = (filePath: string): Promise<ActivityUploadBO> =>
  activityService.upload(filePath);

export const startActivityPublishStream = <T>(
  taskId: string,
  skipped?: string,
  parser?: (line: string) => T,
) => activityService.activtyPublishStream<T>(taskId, skipped, parser);
