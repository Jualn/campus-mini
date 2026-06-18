import createLogger from '../utils/logger';
import eventBus, { EVENTS } from '../utils/event-bus';
import messageService from './message';
import { isLoggedIn } from '../store/helper';

type BannerOptions = Parameters<typeof messageService.getUnreadBannerMessages>[0];

export interface NotifyPollingOptions {
  intervalMs?: number;
  bannerOptions?: BannerOptions;
}

const DEFAULT_INTERVAL_MS = 20000;
const MIN_INTERVAL_MS = 5000;

const log = createLogger('NotifyCenter');

let pollTimer: number | null = null;
let isPolling = false;
// let lastUnreadCount: number | null = null;
let unreadCount = 0;
let pollIntervalMs = DEFAULT_INTERVAL_MS;
let bannerOptions: BannerOptions | undefined;
let activeIntervalMs: number | null = null;

let onBannerTap: ((payload: unknown) => void) | null = null;
let onLogout: (() => void) | null = null;

const applyOptions = (options?: NotifyPollingOptions) => {
  if (!options) return;

  if (typeof options.intervalMs === 'number') {
    pollIntervalMs = Math.max(MIN_INTERVAL_MS, options.intervalMs);
  }

  if (options.bannerOptions !== undefined) {
    bannerOptions = options.bannerOptions;
  }
};

export const getUnreadCount = () => unreadCount;

const emitUnreadChange = (count: number) => {
  unreadCount = count;
  eventBus.emit(EVENTS.NOTIFY_UNREAD_CHANGE, count);
};

/**
 * 执行一次轮询（通常在 app onShow 时调用），获取最新的未读数和 Banner 数据，并触发相关事件。
 * 如果正在轮询中，则跳过本次调用，避免重复请求。
 * 如果用户未登录，则不执行轮询。
 * 如果未读数发生变化，触发 NOTIFY_UNREAD_CHANGE 事件；如果有新的 Banner 消息，触发 NOTIFY_BANNER_SHOW 事件。
 *
 * @param options 可选的轮询配置项，包括轮询间隔和 Banner 请求参数
 * @returns Promise<void>
 */
const pollOnce = async (options?: NotifyPollingOptions) => {
  applyOptions(options);
  if (isPolling) return;
  if (!isLoggedIn()) return;

  isPolling = true;
  try {
    const count = await messageService.getUnreadCount();
    emitUnreadChange(count);

    if (count <= 0) return;

    const nextOptions = bannerOptions
      ? { ...bannerOptions, unreadCount: count }
      : { unreadCount: count };
    const banners = await messageService.getUnreadBannerMessages(nextOptions);
    if (banners.length > 0) {
      eventBus.emit(EVENTS.NOTIFY_BANNER_SHOW, banners);
    }
  } catch (err: unknown) {
    log.warn('pollOnce', 'notify poll failed', err);
  } finally {
    isPolling = false;
  }
};

/**
 * 绑定事件监听器，确保在通知 Banner 被点击时能正确处理，以及在用户退出登录时清理状态。
 * 该函数会在 start() 中调用，确保事件绑定只发生一次。
 * onBannerTap 处理 Banner 点击事件，标记对应消息为已读并刷新列表；onLogout 处理用户退出事件，停止轮询并重置状态。
 * 如果事件处理函数已经绑定，则不会重复绑定。
 *
 * @returns void
 */
const bindEvents = () => {
  if (!onBannerTap) {
    onBannerTap = (payload: unknown) => {
      const item = payload as { id?: string | number; isAggregate?: boolean };
      if (!item.id || item.isAggregate) return;

      void messageService
        .markMessageAsRead(String(item.id))
        .then(() => {
          eventBus.emit(EVENTS.NOTIFY_LIST_REFRESH);
          void pollOnce();
        })
        .catch((err: unknown) => {
          log.warn('onBannerTap', 'mark read failed', err);
        });
    };
    eventBus.on(EVENTS.NOTIFY_BANNER_TAP, onBannerTap);
  }

  if (!onLogout) {
    onLogout = () => {
      stop();
      unreadCount = 0;
      messageService.resetNotificationBannerCache();
      eventBus.emit(EVENTS.NOTIFY_UNREAD_CHANGE, 0);
    };
    eventBus.on(EVENTS.LOGOUT, onLogout);
  }
};

/**
 * 启动通知轮询器，开始定期获取未读通知数和相关 Banner 数据。
 * 如果已经在轮询中，则不会重复启动。
 * 可以通过 options 参数自定义轮询间隔和 Banner 请求参数。
 * 如果用户未登录，则不会启动轮询。
 * 轮询过程中会触发相关事件，供界面组件更新显示。
 *
 * @param options 可选的轮询配置项，包括：
 *   - intervalMs: 轮询间隔，单位毫秒，默认为 20000ms，最小不低于 5000ms
 *   - bannerOptions: 获取 Banner 消息时的额外参数，如 unreadCount 等
 * @returns void
 */
const start = (options?: NotifyPollingOptions) => {
  applyOptions(options);
  bindEvents();

  if (pollTimer && activeIntervalMs === pollIntervalMs) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  activeIntervalMs = pollIntervalMs;
  void pollOnce();
  pollTimer = setInterval(() => {
    void pollOnce();
  }, activeIntervalMs);
};

/**
 * 停止通知轮询器，清除定时器并重置相关状态。
 * 如果当前没有轮询任务在运行，则调用该函数不会有任何效果。
 * @returns void
 */
const stop = () => {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  activeIntervalMs = null;
};

export default {
  start,
  stop,
  pollOnce,
};
