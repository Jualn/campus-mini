// components/in-app-banner/index.ts

import { wxGetWindowInfo, wxNavigateTo } from '../../utils/wx-promise';
import defineComponent from '../../utils/defineComponent';
import { eventBus, EVENTS } from '../../utils/event-bus';
import type { BannerMessage, BannerRouteMethod } from '../../types/business';
import {
  ROUTES,
  buildActivityDetailRoute,
  buildExamDetailRoute,
  buildPostDetailRoute,
} from '../../utils/routes';

interface BannerPrivate {
  _timer?: ReturnType<typeof setTimeout>;
  _nextTimer?: ReturnType<typeof setTimeout>;
  _queue?: BannerMessage[];
  _showing?: boolean;
  _current?: BannerMessage;
  _onShowBanner?: (...args: unknown[]) => void;
  _touchStartX?: number;
  _touchStartY?: number;
  _lastDeltaX?: number;
  _lastDeltaY?: number;
  _touchMoved?: boolean;
  _skipNextTap?: boolean;
}

const HIDDEN_TRANSLATE_Y = -140;
const DISMISS_DISTANCE_X = 90;
const DISMISS_DISTANCE_Y = -52;
const EXIT_DISTANCE_X = 520;
const EXIT_DISTANCE_Y = -170;
const NEXT_SHOW_DELAY = 220;
const PREVIEW_MESSAGES: BannerMessage[] = [
  {
    type: 'system',
    title: '通知样式预览',
    content: '本地数据源，不请求后端',
    notificationCount: 3,
    targetType: 'none',
  },
  {
    type: 'activity',
    title: '活动提醒',
    content: '第二条用于测试队列动画',
    targetType: 'none',
  },
];
const PREVIEW_AGGREGATE_MESSAGES: BannerMessage[] = [
  {
    type: 'system',
    title: '你有 5 条新通知',
    content: '系统通知、活动提醒、互动消息',
    notificationCount: 5,
    isAggregate: true,
    targetType: 'notification',
  },
];

const TYPE_META: Record<
  string,
  {
    icon: string;
    tagText: string;
    accentClass: string;
  }
> = {
  system: {
    icon: '/assets/icons/common/system_notice.svg',
    tagText: '系统',
    accentClass: 'banner--system',
  },
  activity: {
    icon: '/assets/icons/common/activity.svg',
    tagText: '活动',
    accentClass: 'banner--activity',
  },
  exam: {
    icon: '/assets/icons/common/exam.svg',
    tagText: '考试',
    accentClass: 'banner--exam',
  },
  interaction: {
    icon: '/assets/icons/common/interaction.svg',
    tagText: '互动',
    accentClass: 'banner--interaction',
  },
};

const hasBannerContent = (item: BannerMessage) => {
  const title = item.title?.trim();
  const content = item.content?.trim();
  return Boolean(title ?? content ?? item.isAggregate ?? item.notificationCount);
};

const resolveLocalRoute = (
  msg: BannerMessage,
): { url: string; method: BannerRouteMethod } | null => {
  if (msg.routeUrl) {
    return {
      url: msg.routeUrl,
      method: msg.routeMethod ?? 'navigateTo',
    };
  }

  const targetType = (msg.targetType ?? '').toLowerCase();
  const targetId = msg.targetId ?? '';

  if (msg.isAggregate || targetType === 'notification' || targetType === 'notification_center') {
    return {
      url: ROUTES.MESSAGE,
      method: 'switchTab',
    };
  }

  if (!targetType || targetType === 'none' || !targetId) return null;

  const routes: Record<string, string> = {
    activity: buildActivityDetailRoute(targetId),
    exam: buildExamDetailRoute(targetId),
    post: buildPostDetailRoute(targetId),
  };

  const url = routes[targetType];
  if (!url) return null;

  return {
    url,
    method: 'navigateTo',
  };
};

/**
 * In-App Banner 组件
 * 导入该组件后需启动的eventBus事件：
 * 1. 监听 NOTIFY_BANNER_TAP 事件，处理 Banner 点击后的逻辑（如标记已读、刷新列表等）
 * 2. 监听 LOGOUT 事件，在用户退出登录时清理状态（如停止轮询、重置未读数等）
 */
defineComponent<BannerPrivate>()({
  properties: {
    // >=0 时使用外部传入值；<0 自动避让胶囊
    top: {
      type: Number,
      value: -1,
    },
    duration: {
      type: Number,
      value: 4000,
    },
    // 预览模式：使用本地数据源
    previewMode: {
      type: Boolean,
      value: false,
    },
    // 预览状态：可切换显示/隐藏
    previewVisible: {
      type: Boolean,
      value: true,
    },
    // 预览数据：不传则使用默认预览消息
    previewMessages: {
      type: Array,
      value: [],
    },
    // 预览变体：normal / aggregate
    previewVariant: {
      type: String,
      value: 'normal',
    },
  },

  data: {
    visible: false,
    topPx: 80,
    translateX: 0,
    translateY: HIDDEN_TRANSLATE_Y,
    opacity: 0,
    transitionEnabled: true,
    dragging: false,
    icon: '/assets/icons/common/message_center.svg',
    tagText: '通知',
    title: '',
    content: '',
    targetType: '',
    targetId: '',
    notificationId: '',
    notificationCount: 0,
    isAggregate: false,
    accentClass: 'banner--system',
  },

  observers: {
    top() {
      this._updateTopOffset();
    },
    'previewMode, previewVisible, previewMessages, previewVariant'() {
      this._syncPreviewState();
    },
  },

  lifetimes: {
    attached() {
      this._queue = [];
      this._showing = false;
      this._current = undefined;
      this._updateTopOffset();
      this._syncPreviewState();

      this._onShowBanner = (payload: unknown) => {
        if (this.properties.previewMode) return;
        // 监听全局通知弹窗事件，payload 支持单条或数组
        this._enqueue(payload as BannerMessage | BannerMessage[]);
      };

      // 订阅：全局触发弹窗展示
      eventBus.on(EVENTS.NOTIFY_BANNER_SHOW, this._onShowBanner);
    },

    detached() {
      if (this._onShowBanner) {
        // 取消订阅，避免页面切换后重复触发
        eventBus.off(EVENTS.NOTIFY_BANNER_SHOW, this._onShowBanner);
        this._onShowBanner = undefined;
      }

      this._clearTimer();
      this._clearNextTimer();
      this._queue = [];
      this._showing = false;
      this._current = undefined;
    },
  },

  methods: {
    _updateTopOffset() {
      const fixedTop = this.properties.top;
      if (!Number.isNaN(fixedTop) && fixedTop >= 0) {
        this.setData({ topPx: fixedTop });
        return;
      }

      const statusBarHeight = wxGetWindowInfo().statusBarHeight || 20;
      const menuButton =
        typeof wx.getMenuButtonBoundingClientRect === 'function'
          ? wx.getMenuButtonBoundingClientRect()
          : null;

      const topPx = menuButton?.bottom ? menuButton.bottom + 12 : statusBarHeight + 44;
      this.setData({ topPx });
    },

    _normalizeMessage(msg: BannerMessage = {}) {
      const type = (msg.type ?? 'system').toLowerCase();
      const meta = TYPE_META[type] ?? TYPE_META.system;
      const count = msg.notificationCount ?? 0;
      const isAggregate = Boolean(msg.isAggregate);
      const title =
        msg.title?.trim() ??
        (isAggregate && count > 1 ? `你有 ${String(count)} 条新通知` : '你有一条新消息');

      return {
        icon: msg.icon ?? (isAggregate ? '🔔' : meta.icon),
        tagText: msg.tagText ?? (isAggregate ? '通知' : meta.tagText),
        title,
        content: msg.content?.trim() ?? '',
        targetType: msg.targetType ?? msg.type ?? '',
        targetId: msg.targetId ?? '',
        notificationId: msg.id ?? '',
        notificationCount: count,
        isAggregate,
        accentClass: msg.accentClass ?? meta.accentClass,
      };
    },

    _getPreviewMessages(): BannerMessage[] {
      const list = this.properties.previewMessages as BannerMessage[] | undefined;
      if (Array.isArray(list) && list.length > 0) return list;
      if (this.properties.previewVariant === 'aggregate') {
        return PREVIEW_AGGREGATE_MESSAGES;
      }
      return PREVIEW_MESSAGES;
    },

    _syncPreviewState() {
      if (!this.properties.previewMode) return;

      if (!this.properties.previewVisible) {
        this._clearTimer();
        this._queue = [];
        this._showing = false;
        this._current = undefined;
        this.setData({
          visible: false,
          translateX: 0,
          translateY: HIDDEN_TRANSLATE_Y,
          opacity: 0,
          transitionEnabled: true,
          dragging: false,
        });
        return;
      }

      this._clearTimer();
      this._queue = [];
      this._showing = false;
      this._current = undefined;
      this._enqueue(this._getPreviewMessages());
    },

    _enqueue(msg: BannerMessage | BannerMessage[]) {
      const list = Array.isArray(msg) ? msg : [msg];
      const validList = list.filter(hasBannerContent);
      if (validList.length === 0) return;

      this._queue = [...(this._queue ?? []), ...validList];

      if (!this._showing) {
        this._showNext();
      }
    },

    _showNext() {
      const next = this._queue?.shift();
      if (!next) {
        this._showing = false;
        this._current = undefined;
        this.setData({
          visible: false,
          translateX: 0,
          translateY: HIDDEN_TRANSLATE_Y,
          opacity: 0,
          transitionEnabled: true,
          dragging: false,
        });
        return;
      }

      this._showing = true;
      this._current = next;
      this._touchMoved = false;
      this._skipNextTap = false;

      const normalized = this._normalizeMessage(next);
      this.setData({
        visible: true,
        transitionEnabled: true,
        dragging: false,
        translateX: 0,
        translateY: 0,
        opacity: 1,
        ...normalized,
      });

      this._startTimer();
    },

    _startTimer() {
      this._clearTimer();
      const duration = Math.max(1200, this.properties.duration);

      this._timer = setTimeout(() => {
        this._dismissCurrent('auto');
      }, duration);
    },

    _clearTimer() {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = undefined;
      }
    },

    _clearNextTimer() {
      if (this._nextTimer) {
        clearTimeout(this._nextTimer);
        this._nextTimer = undefined;
      }
    },

    _dismissCurrent(reason: 'auto' | 'close' | 'swipe' | 'tap') {
      this._clearTimer();

      if (reason === 'close' || reason === 'tap') {
        this._queue = [];
      }

      let translateX = 0;
      let translateY = HIDDEN_TRANSLATE_Y;

      if (reason === 'swipe') {
        const deltaX = this._lastDeltaX ?? 0;
        const deltaY = this._lastDeltaY ?? 0;
        const shouldExitSide = Math.abs(deltaX) >= Math.abs(deltaY);

        translateX = shouldExitSide ? (deltaX >= 0 ? EXIT_DISTANCE_X : -EXIT_DISTANCE_X) : 0;
        translateY = shouldExitSide ? Math.min(deltaY, 0) : EXIT_DISTANCE_Y;
      }

      this.setData({
        visible: false,
        transitionEnabled: true,
        dragging: false,
        translateX,
        translateY,
        opacity: 0,
      });

      this._clearNextTimer();
      this._nextTimer = setTimeout(() => {
        this._nextTimer = undefined;
        this.setData({
          translateX: 0,
          translateY: HIDDEN_TRANSLATE_Y,
        });
        this._showNext();
      }, NEXT_SHOW_DELAY);
    },

    _navigateByMessage(msg: BannerMessage) {
      const route = resolveLocalRoute(msg);
      if (!route) return;

      if (route.method === 'switchTab') {
        void wx.switchTab({ url: route.url });
        return;
      }

      void wxNavigateTo({ url: route.url });
    },

    onTouchStart(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.visible) return;

      const touch = e.touches[0];

      this._clearTimer();
      this._touchStartX = touch.clientX;
      this._touchStartY = touch.clientY;
      this._lastDeltaX = 0;
      this._lastDeltaY = 0;
      this._touchMoved = false;
      this._skipNextTap = false;

      this.setData({
        transitionEnabled: false,
        dragging: true,
      });
    },

    onTouchMove(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.visible) return;

      const touch = e.touches[0];

      const startX = this._touchStartX ?? touch.clientX;
      const startY = this._touchStartY ?? touch.clientY;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < 3 && absY < 3) return;

      this._touchMoved = true;
      this._lastDeltaX = deltaX;
      this._lastDeltaY = deltaY;

      const limitedX = Math.max(-140, Math.min(140, deltaX));
      const limitedY = Math.min(36, Math.max(-90, deltaY));
      const distance = Math.max(absX, absY);
      const opacity = Math.max(0.45, 1 - distance / 260);

      this.setData({
        translateX: limitedX,
        translateY: limitedY,
        opacity,
      });
    },

    onTouchEnd() {
      if (!this.data.visible) return;

      const deltaX = this._lastDeltaX ?? 0;
      const deltaY = this._lastDeltaY ?? 0;
      const shouldDismiss = Math.abs(deltaX) >= DISMISS_DISTANCE_X || deltaY <= DISMISS_DISTANCE_Y;

      this.setData({
        transitionEnabled: true,
        dragging: false,
      });

      if (shouldDismiss) {
        this._skipNextTap = true;
        this._dismissCurrent('swipe');
        return;
      }

      this.setData({
        translateX: 0,
        translateY: 0,
        opacity: 1,
      });

      this._startTimer();
    },

    onTouchCancel() {
      if (!this.data.visible) return;

      this.setData({
        transitionEnabled: true,
        dragging: false,
        translateX: 0,
        translateY: 0,
        opacity: 1,
      });

      this._startTimer();
    },

    onTap() {
      if (this._skipNextTap) {
        this._skipNextTap = false;
        return;
      }

      if (this._touchMoved) {
        this._touchMoved = false;
        return;
      }

      const current = this._current;
      if (!current) return;

      // 广播点击事件，外部可联动标记已读/刷新列表
      eventBus.emit(EVENTS.NOTIFY_BANNER_TAP, current);
      this._dismissCurrent('tap');
      this._navigateByMessage(current);
    },

    onClose() {
      this._dismissCurrent('close');
    },
  },
});
