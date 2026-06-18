// event-bus.ts
/**
 * EventBus（事件总线）
 *
 * 用于实现跨模块 / 跨页面通信的发布-订阅机制。
 *
 * 核心思想：
 * - emit：发布事件（通知发生了什么）
 * - on  ：订阅事件（监听某件事发生）
 * - off ：取消订阅
 * - once：只监听一次
 *
 * ⚠️ 注意：
 * - EventBus 不保存状态，只负责“通知”
 * - 不适用于全局状态管理（如 userInfo / token）
 * - 适合一次性事件或松耦合通信
 *
 * 使用场景：
 * - 登录成功通知
 * - websocket 消息广播
 * - 页面刷新通知
 * - toast / modal 控制
 * - 跨页面事件触发
 */

import { type PostUpdatePayload } from '../events/post-event';
import type { BannerMessage, PostCardItem } from '../types/business';
import createLogger from './logger';

const log = createLogger('EventBus');

/**
 * 统一事件名常量（避免字符串拼写错误）
 *
 * 建议：
 * - 所有 event 使用常量管理
 * - 避免散落字符串
 */
export const EVENTS = {
  LOGIN_SUCCESS: 'login:success',
  LOGOUT: 'logout',
  USER_INFO_UPDATE: 'user:info:update',
  ORDER_CREATED: 'order:created',
  CART_CHANGED: 'cart:changed',
  PAGECONTAINER_STATUS_CHANGED: 'pagecontainer:status:changed',

  LIKE_CHANGED: 'like:changed', // 点赞状态变化

  /** 帖子相关事件：创建 */
  POST_CREATED: 'post:created',

  /** 帖子相关事件：更新 */
  POST_UPDATED: 'post:updated',

  /** 帖子相关事件：删除 */
  POST_DELETED: 'post:deleted',

  /** 通知弹窗：展示 */
  NOTIFY_BANNER_SHOW: 'notify:banner:show',

  /** 通知弹窗：点击 */
  NOTIFY_BANNER_TAP: 'notify:banner:tap',

  /** 通知未读数变化 */
  NOTIFY_UNREAD_CHANGE: 'notify:unread:change',

  /** 通知列表刷新 */
  NOTIFY_LIST_REFRESH: 'notify:list:refresh',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface LikeChangedPayload {
  targetType: string;
  targetId: string;
  liked: boolean;
  likeCount: number;
}

export interface EventMap {
  [EVENTS.LOGIN_SUCCESS]: [];

  [EVENTS.LOGOUT]: [];

  [EVENTS.USER_INFO_UPDATE]: [userId: number];

  [EVENTS.ORDER_CREATED]: [orderId: string];

  [EVENTS.CART_CHANGED]: [];

  [EVENTS.PAGECONTAINER_STATUS_CHANGED]: [status: boolean];

  [EVENTS.POST_CREATED]: [PostCardItem];

  [EVENTS.POST_UPDATED]: [PostUpdatePayload];

  [EVENTS.POST_DELETED]: [postId: string];

  [EVENTS.LIKE_CHANGED]: [LikeChangedPayload];

  [EVENTS.NOTIFY_BANNER_SHOW]: [BannerMessage | BannerMessage[]];

  [EVENTS.NOTIFY_BANNER_TAP]: [BannerMessage];

  [EVENTS.NOTIFY_UNREAD_CHANGE]: [unreadCount: number];

  [EVENTS.NOTIFY_LIST_REFRESH]: [];
}

// map 的类型：key 是 string，value 是函数数组
type Fn<T extends unknown[] = unknown[]> = (...args: T) => void;
const map = new Map<EventName, Set<Fn>>(); // key → Set<fn>

const eventBus = {
  /**
   * 订阅事件, 确保同一事件订阅的是同一函数实例, 取消订阅也是同一函数实例
   * 不然会导致无法正确取消订阅, 因为 on/off 需要同一个函数实例才能正确添加/删除监听
   * 避免泄露和重复订阅, 页面推荐定义在 全局私有变量中, 生命周期内保持不变, 然后在 on或者什么时候之前给函数赋值
   * @example
   * const listener = (data) => { ... };
   * eventBus.on(EVENTS.SOME_EVENT, listener);
   * eventBus.off(EVENTS.SOME_EVENT, listener); // 正确取消订阅
   *
   * // 错误示范：每次调用 on/off 都创建了一个新的函数实例，导致无法正确取消订阅
   * eventBus.on(EVENTS.SOME_EVENT, (data) => { ... });
   *
   * @param {string} event 事件名
   * @param {Function} fn 回调函数
   */
  on<K extends EventName>(event: K, fn: (...args: EventMap[K]) => void) {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event)?.add(fn as Fn); // ! 表示非空
    return () => {
      this.off(event, fn);
    };
  },

  /**
   * 取消订阅, 确保传入的函数实例与订阅时一致
   * @example
   * const listener = (data) => { ... };
   *
   * eventBus.on(EVENTS.SOME_EVENT, listener);
   * eventBus.off(EVENTS.SOME_EVENT, listener); // 正确取消订阅
   *
   * // 错误示范：无法取消订阅，因为传入了一个新的函数实例
   * eventBus.off(EVENTS.SOME_EVENT, (data) => { ... });
   *
   * @param {string} event 事件名
   * @param {Function} fn 回调函数
   */
  off<K extends EventName>(event: K, fn: (...args: EventMap[K]) => void) {
    map.get(event)?.delete(fn as Fn);
  },

  /**
   * 只监听一次事件（触发后自动解绑）
   * @param {string} event 事件名
   * @param {Function} fn 回调函数
   */
  once<K extends EventName>(event: K, fn: (...args: EventMap[K]) => void) {
    const wrapper = (...args: EventMap[K]) => {
      fn(...args);
      eventBus.off(event, wrapper);
    };

    eventBus.on(event, wrapper);
  },

  /**
   * 发布事件
   * @param {string} event 事件名
   * @param  {...any} args 传递给监听函数的参数
   */
  emit<K extends EventName>(event: K, ...args: EventMap[K]) {
    map.get(event)?.forEach((fn) => {
      try {
        fn(...args);
      } catch (e) {
        log.error('emit', `"${event}" listener error:`, e);
      }
    });
  },

  clear(event?: EventName) {
    if (event) {
      map.delete(event);
    } else {
      map.clear();
    }
  },
};

export default eventBus;
