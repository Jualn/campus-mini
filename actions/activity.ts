import { activityService } from '../services/index';
import type { ActivityCreateRequest, ActivityPageQuery, ActivityUploadBO } from '../types/api';

export const createActivity = (payload: ActivityCreateRequest): Promise<string> =>
  activityService.create(payload);

export const getActivityList = (query?: ActivityPageQuery) =>
  activityService.getActivityList(query);

export const getActivityDetail = (activityId: string) =>
  activityService.getActivityDetail(activityId);

export const uploadActivityAiFile = (filePath: string): Promise<ActivityUploadBO> =>
  activityService.upload(filePath);

export const startActivityPublishStream = <T>(
  taskId: string,
  skipped?: string,
  parser?: (line: string) => T,
) => activityService.activtyPublishStream<T>(taskId, skipped, parser);
