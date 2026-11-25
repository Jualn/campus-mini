import { api } from './api';
import { getLocalTemplateLimit } from './notification-subscriptions';
import { getUserId } from '../stores/helper';
import { eventBus, EVENTS } from '../utils/event-bus';
import type {
  NotificationSubscriptionOptions,
  NotificationSubscriptionOption,
  NotificationSubscriptionSceneCode,
  NotificationPreferences,
} from '../types/api';

let session = 0;
let activeRequest = false;
const rejectedUntil = new Map<string, number>();
const reset = () => {
  session++;
  rejectedUntil.clear();
};
eventBus.on(EVENTS.LOGOUT, reset);
eventBus.on(EVENTS.LOGIN_SUCCESS, reset);
// Saving preferences invalidates prepared operations even if a page remains mounted.
export const invalidateBusinessSubscriptions = () => {
  session++;
};

/** One page/component owns one intent. Prepare on load; request synchronously in the tap. */
export const createBusinessSubscription = (isCurrent: () => boolean) => {
  let generation = 0;
  let disposed = false;
  let pending = false;
  const isDisposed = () => disposed;
  let prepared: {
    scene: NotificationSubscriptionSceneCode;
    resourceId?: string;
    owner: string;
    session: number;
    at: number;
    catalog: NotificationSubscriptionOptions;
    preferences: NotificationPreferences;
    mainSwitch?: boolean;
    remembered: Record<string, string>;
  } | null = null;
  const prepare = async (scene: NotificationSubscriptionSceneCode, resourceId?: string) => {
    if (pending) return;
    const version = ++generation,
      owner = getUserId(),
      epoch = session;
    prepared = null;
    if (!owner || isDisposed()) return;
    try {
      const native = new Promise<{ mainSwitch?: boolean; itemSettings?: Record<string, string> }>(
        (resolve) => {
          try {
            wx.getSetting({
              withSubscriptions: true,
              success: (r) => {
                const observed: unknown = r.subscriptionsSetting;
                resolve(observed && typeof observed === 'object' ? observed : {});
              },
              fail: () => {
                resolve({});
              },
            });
          } catch {
            resolve({});
          }
        },
      );
      const [catalog, preferences, settings] = await Promise.all([
        api.notify.getSubscriptionOptions({
          sceneCode: scene,
          ...(resourceId ? { resourceId } : {}),
        }) as Promise<NotificationSubscriptionOptions | null>,
        api.notify.getPreferences() as Promise<NotificationPreferences | null>,
        native,
      ]);
      if (
        isDisposed() ||
        version !== generation ||
        owner !== getUserId() ||
        epoch !== session ||
        !isCurrent()
      )
        return;
      if (
        catalog?.sceneCode !== scene ||
        catalog.resourceId !== resourceId ||
        !catalog.configurationRevision ||
        !Number.isInteger(catalog.maxTemplatesPerRequest) ||
        catalog.maxTemplatesPerRequest < 1 ||
        !Array.isArray(catalog.items) ||
        !preferences ||
        !Array.isArray(preferences.items)
      )
        return;
      prepared = {
        scene,
        resourceId,
        owner,
        session: epoch,
        at: Date.now(),
        catalog,
        preferences,
        mainSwitch: settings.mainSwitch,
        remembered: settings.itemSettings ?? {},
      };
    } catch {
      /* Consent is optional; a failed preload never blocks the business. */
    }
  };
  const request = (
    scene: NotificationSubscriptionSceneCode,
    resourceId?: string,
  ): Promise<boolean> => {
    const p = prepared,
      version = generation,
      epoch = session,
      owner = getUserId();
    const current = () =>
      !disposed &&
      version === generation &&
      epoch === session &&
      owner === getUserId() &&
      isCurrent();
    if (!current()) return Promise.resolve(false);
    if (
      p?.scene !== scene ||
      p.resourceId !== resourceId ||
      p.session !== epoch ||
      p.owner !== owner ||
      Date.now() - p.at > 300000 ||
      p.mainSwitch === false ||
      activeRequest ||
      typeof wx.requestSubscribeMessage !== 'function'
    )
      return Promise.resolve(true);
    const items = [] as NotificationSubscriptionOptions['items'];
    const limit = Math.min(3, getLocalTemplateLimit(), p.catalog.maxTemplatesPerRequest);
    for (const candidate of p.catalog.items) {
      const item = candidate as NotificationSubscriptionOption | null;
      if (items.length >= limit) break;
      if (
        !item?.templateId ||
        !item.title ||
        !['ONE_TIME', 'LONG_TERM'].includes(item.subscriptionKind) ||
        !Array.isArray(item.categories) ||
        !item.categories.length ||
        !item.categories.every((category) =>
          p.preferences.items.some((candidate) => {
            const pref = candidate as NotificationPreferences['items'][number] | null;
            return (
              pref?.category === category && pref.channel === 'WECHAT_MINI_PROGRAM' && pref.enabled
            );
          }),
        ) ||
        p.remembered[item.templateId] === 'reject' ||
        (rejectedUntil.get(item.templateId) ?? 0) > Date.now() ||
        items.some(
          (old) =>
            old.templateId === item.templateId ||
            old.title === item.title ||
            old.subscriptionKind !== item.subscriptionKind,
        )
      )
        continue;
      items.push(item);
    }
    if (!items.length) return Promise.resolve(true);
    activeRequest = true;
    pending = true;
    // No awaited work precedes this native call; preserve the user gesture.
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        activeRequest = false;
        pending = false;
        resolve(current());
      };
      try {
        wx.requestSubscribeMessage({
          tmplIds: items.map((item) => item.templateId),
          success: (result) => {
            if (!current()) return;
            for (const item of items)
              if (result[item.templateId] === 'reject')
                rejectedUntil.set(item.templateId, Date.now() + 300000);
          },
          fail: (error) => {
            if (current() && error.errCode === 20004) p.mainSwitch = false;
          },
          complete: finish,
        });
      } catch {
        finish();
      }
    });
  };
  return {
    prepare,
    request,
    get pending() {
      return pending;
    },
    dispose: () => {
      disposed = true;
      generation++;
      prepared = null;
    },
  };
};
