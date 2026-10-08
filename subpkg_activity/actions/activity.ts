import * as activityService from '../services/activity';
import * as registrationService from '../services/registration';
import { ensureLogin } from '../../actions/auth';
import { getUserId } from '../../stores/helper';
import { searchActivities as searchActivityList } from '../services/search';
import type { ActivityCreateRequest, ActivityPageQuery, ActivityUploadBO } from '../../types/api';
import type { ActivityCard, ServiceCursorPage } from '../../types/business';

export const createActivity = (payload: ActivityCreateRequest): Promise<string> =>
  activityService.create(payload);

async function forCurrentUser<T>(operation: () => Promise<T>): Promise<T> {
  await ensureLogin();
  const userId = getUserId();
  if (!userId) throw new Error('登录状态不可用，请重试');
  const result = await operation();
  if (getUserId() !== userId) throw new Error('登录状态已变化，请重试');
  return result;
}

export const getActivityList = (query?: ActivityPageQuery) =>
  forCurrentUser(() => activityService.getActivityList(query));

export const searchActivities = (query: {
  keyword: string;
  lastId?: string;
  pageSize?: number;
}): Promise<ServiceCursorPage<ActivityCard>> => forCurrentUser(() => searchActivityList(query));

export const getActivityDetail = (activityId: string) =>
  forCurrentUser(() => activityService.getActivityDetail(activityId));

export const getActivityDetailState = (activityId: string) =>
  forCurrentUser(async () => {
    const activity = await activityService.getActivityDetail(activityId);
    const hasPlatformRegistration =
      activity.registrationMode === 2 || activity.registrationMode === 4;
    const registration = hasPlatformRegistration
      ? await registrationService.readMyRegistration(activityId)
      : null;
    const registrationStatus: '' | 'SUBMITTED' | 'CANCELLED' = registration?.status ?? '';
    return {
      activity,
      registrationStatus,
    };
  });

export async function setActivitySubscription(id: string, subscribed: boolean) {
  return forCurrentUser(() => activityService.setActivitySubscription(id, subscribed));
}

export const uploadActivityAiFile = (filePath: string): Promise<ActivityUploadBO> =>
  activityService.upload(filePath);

export const startActivityPublishStream = <T>(
  taskId: string,
  skipped?: string,
  parser?: (line: string) => T,
) => activityService.activtyPublishStream<T>(taskId, skipped, parser);
