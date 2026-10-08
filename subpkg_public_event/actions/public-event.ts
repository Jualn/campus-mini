import * as publicEventService from '../services/public-event';
import type { EventListQuery } from '../services/event-api';
import { ensureLogin } from '../../actions/auth';
import { getUserId } from '../../stores/helper';

async function forCurrentUser<T>(operation: () => Promise<T>): Promise<T> {
  await ensureLogin();
  const userId = getUserId();
  if (!userId) throw new Error('登录状态不可用，请重试');
  const result = await operation();
  if (getUserId() !== userId) throw new Error('登录状态已变化，请重试');
  return result;
}

export const getPublicEventDetail = (id: string) =>
  forCurrentUser(() => publicEventService.getPublicEventDetail(id));
export const getPublicEventCards = (
  query: EventListQuery & { keyword?: string; lastId?: string } = {},
) => forCurrentUser(() => publicEventService.getPublicEventCards(query));
export const setPublicEventSubscription = (id: string, subscribed: boolean) =>
  forCurrentUser(() => publicEventService.setPublicEventSubscription(id, subscribed));
