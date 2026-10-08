import type {
  ActivityCursorPageDTO,
  ActivityDetailDTO,
  ActivityRegistrationDTO,
  PublicEventCursorPageDTO,
  PublicEventDetailDTO,
  SubscriptionState,
  WriteRegistrationRequestDTO,
} from '../../types/event-contract';
import { http, httpWithMeta } from '../../utils/request';

export interface EventListQuery {
  cursor?: string;
  pageSize?: number;
  q?: string;
  sort?: '-publishedAt';
  lifecycleStatus?: 'ACTIVE' | 'ENDED' | 'CANCELLED';
}

const activityBase = (id: string) => `/v1/activities/${encodeURIComponent(id)}`;
const publicEventBase = (id: string) => `/v1/public-events/${encodeURIComponent(id)}`;

export const eventApi = {
  activities: {
    list: (query: EventListQuery & { category?: string } = {}) =>
      http.get<ActivityCursorPageDTO>('/v1/activities', query, { auth: 'required' }),
    detail: (id: string) =>
      http.get<ActivityDetailDTO>(activityBase(id), undefined, { auth: 'required' }),
    subscription: (id: string) =>
      http.get<SubscriptionState>(`${activityBase(id)}/subscription`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
    subscribe: (id: string) =>
      http.put<SubscriptionState>(`${activityBase(id)}/subscription`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
    unsubscribe: (id: string) =>
      http.del(`${activityBase(id)}/subscription`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
  },
  publicEvents: {
    list: (query: EventListQuery & { type?: string } = {}) =>
      http.get<PublicEventCursorPageDTO>('/v1/public-events', query, { auth: 'required' }),
    detail: (id: string) =>
      http.get<PublicEventDetailDTO>(publicEventBase(id), undefined, { auth: 'required' }),
    subscription: (id: string) =>
      http.get<SubscriptionState>(`${publicEventBase(id)}/subscription`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
    subscribe: (id: string) =>
      http.put<SubscriptionState>(`${publicEventBase(id)}/subscription`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
    unsubscribe: (id: string) =>
      http.del(`${publicEventBase(id)}/subscription`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
  },
  registrations: {
    mine: (id: string) =>
      httpWithMeta.get<ActivityRegistrationDTO>(`${activityBase(id)}/registrations/me`, undefined, {
        auth: 'required',
        sensitive: true,
      }),
    create: (id: string, payload: WriteRegistrationRequestDTO, etag?: string) =>
      httpWithMeta.post<ActivityRegistrationDTO>(`${activityBase(id)}/registrations`, payload, {
        auth: 'required',
        sensitive: true,
        headers: etag ? { 'If-Match': etag } : undefined,
      }),
    replace: (id: string, payload: WriteRegistrationRequestDTO, etag: string) =>
      httpWithMeta.put<ActivityRegistrationDTO>(`${activityBase(id)}/registrations/me`, payload, {
        auth: 'required',
        sensitive: true,
        headers: { 'If-Match': etag },
      }),
    cancel: (id: string, etag: string) =>
      httpWithMeta.post<ActivityRegistrationDTO>(
        `${activityBase(id)}/registrations/me:cancel`,
        undefined,
        {
          auth: 'required',
          sensitive: true,
          headers: { 'If-Match': etag },
        },
      ),
  },
};
