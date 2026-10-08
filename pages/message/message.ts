import * as notificationCenter from '../../actions/notification-center';
import { authReady, ensureLogin } from '../../actions/auth';
import { listNotifications, isInvalidNotificationCursor } from '../../services/notification';
import type { NotificationBoxCategory } from '../../types/notification-contract';
import { getUserId } from '../../stores/helper';
import { eventBus, EVENTS } from '../../utils/event-bus';
import { getCustomTabBar } from '../../utils/tabbar';
import { showErrorToast, showInfoToast } from '../../utils/notify';
import { useListLoad } from '../../behaviors/useListLoad';
import definePage from '../../utils/definePage';
import {
  mergeNotificationCards,
  notificationFilterTabs,
  type NotificationCard,
} from './message-model';

definePage({
  behaviors: [useListLoad({ skeletonDelay: 140, minSkeletonDuration: 280, defaultHasMore: false })],
  _generation: 0,
  _visible: false,
  _ready: false,
  _loading: false,
  _dirty: true,
  _owner: null as string | null,
  _observer: null as WechatMiniprogram.IntersectionObserver | null,
  // Page options must contain simple placeholders; create instance-owned Sets in onLoad.
  _visibleIds: null as unknown as Set<string>,
  _attemptedIds: null as unknown as Set<string>,
  _confirmedReadIds: null as unknown as Set<string>,
  _readTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  _reading: false,
  _onUnread: null as ((count: number) => void) | null,
  _onRefresh: null as ((ids?: string[]) => void) | null,
  _onIdentity: null as (() => void) | null,

  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,
    skeletonRows: [1, 2, 3],
    activeFilter: '',
    filterTabs: notificationFilterTabs,
    messages: [] as NotificationCard[],
    unreadCount: 0,
    unreadKnown: false,
    nextCursor: '',
    headCursor: '',
    markingAll: false,
    readError: false,
  },

  onLoad() {
    this._visibleIds = new Set<string>();
    this._attemptedIds = new Set<string>();
    this._confirmedReadIds = new Set<string>();
    const sys = wx.getWindowInfo();
    const menu = wx.getMenuButtonBoundingClientRect();
    this.setData({
      statusBarHeight: sys.statusBarHeight || 20,
      navTopGap: Math.max(menu.top - sys.statusBarHeight, 6),
      navHeight: menu.height || 32,
    });
    this._onUnread = (count) => {
      this.setData({ unreadCount: count, unreadKnown: notificationCenter.isUnreadKnown() });
    };
    this._onRefresh = (ids) => {
      this._dirty = true;
      if (notificationCenter.hasFailedReads()) this.setData({ readError: true });
      if (ids?.length) {
        ids.forEach((id) => this._confirmedReadIds.add(id));
        this.setData({
          messages: this.data.messages.map((item) =>
            ids.includes(item.id) ? { ...item, isRead: true } : item,
          ),
        });
      }
    };
    this._onIdentity = () => {
      if (this._owner === getUserId()) return;
      this._generation += 1;
      this._owner = getUserId();
      this._loading = false;
      this._reading = false;
      this._attemptedIds.clear();
      this._confirmedReadIds.clear();
      this._disconnectObserver();
      this.setData({
        messages: [],
        nextCursor: '',
        headCursor: '',
        readError: false,
        markingAll: false,
      });
      this._dirty = true;
      if (this._visible && getUserId()) void this._loadMessages();
    };
    eventBus.on(EVENTS.NOTIFY_UNREAD_CHANGE, this._onUnread);
    eventBus.on(EVENTS.NOTIFY_LIST_REFRESH, this._onRefresh);
    eventBus.on(EVENTS.LOGIN_SUCCESS, this._onIdentity);
    eventBus.on(EVENTS.LOGOUT, this._onIdentity);
  },

  onShow() {
    this._visible = true;
    getCustomTabBar(this).init();
    this.setData({
      unreadCount: notificationCenter.getUnreadCount(),
      unreadKnown: notificationCenter.isUnreadKnown(),
      readError: this.data.readError || notificationCenter.hasFailedReads(),
    });
    if (this._dirty || this._owner !== getUserId()) void this._loadMessages();
    else this._observeCards();
  },

  onReady() {
    this._ready = true;
    this._observeCards();
  },
  onHide() {
    this._visible = false;
    this._generation += 1;
    if (this._loading || this.data.listLoad.phase === 'initial') this._dirty = true;
    this._loading = false;
    this._reading = false;
    this._attemptedIds.clear();
    this._disconnectObserver();
    this._listLoadClearTimers();
    this.setData({ markingAll: false });
  },
  onUnload() {
    void this.onHide();
    if (this._onUnread) eventBus.off(EVENTS.NOTIFY_UNREAD_CHANGE, this._onUnread);
    if (this._onRefresh) eventBus.off(EVENTS.NOTIFY_LIST_REFRESH, this._onRefresh);
    if (this._onIdentity) {
      eventBus.off(EVENTS.LOGIN_SUCCESS, this._onIdentity);
      eventBus.off(EVENTS.LOGOUT, this._onIdentity);
    }
  },

  async onPullDownRefresh() {
    await this._loadMessages();
    void wx.stopPullDownRefresh();
  },
  onReachBottom() {
    if (this._listLoadCanMore(this._loading)) void this._loadMessages(true);
  },
  onRetryLoadMore() {
    void this._loadMessages(true);
  },
  onRetryInitialLoad() {
    void this._loadMessages();
  },

  async _loadMessages(append = false) {
    if (append && (this._loading || !this.data.nextCursor)) return;
    const generation = ++this._generation;
    const filter = this.data.activeFilter;
    const initial = !append && !this.data.messages.length;
    this._loading = true;
    this._reading = false;
    this._disconnectObserver();
    if (initial) this._listLoadBeginInitial();
    else if (append) this._listLoadBeginMore();
    else this._listLoadBeginRefresh();
    try {
      await authReady;
      await ensureLogin();
      if (!this._visible || generation !== this._generation) return;
      const owner = getUserId();
      this._owner = owner;
      const page = await listNotifications({
        boxCategory: filter ? (filter as NotificationBoxCategory) : undefined,
        cursor: append ? this.data.nextCursor : undefined,
      });
      if (!this._isCurrent(generation) || owner !== getUserId()) return;
      const messages = mergeNotificationCards(append ? this.data.messages : [], page.items).map(
        (item) => (this._confirmedReadIds.has(item.id) ? { ...item, isRead: true } : item),
      );
      this._dirty = false;
      if (!append) this._attemptedIds.clear();
      this.setData({ messages, nextCursor: page.nextCursor ?? '', headCursor: page.headCursor });
      const observe = () => {
        if (this._isCurrent(generation)) this._observeCards();
      };
      if (initial)
        this._listLoadEndInitial(
          {
            success: true,
            hasContent: !!messages.length,
            hasMore: page.hasMore,
          },
          observe,
        );
      else if (append) this._listLoadEndMore({ success: true, hasMore: page.hasMore }, observe);
      else
        this._listLoadEndRefresh(
          {
            success: true,
            hasContent: !!messages.length,
            hasMore: page.hasMore,
          },
          observe,
        );
    } catch (err) {
      if (!this._visible || generation !== this._generation) return;
      if (initial) this._listLoadEndInitial({ success: false, hasContent: false });
      else if (append) this._listLoadEndMore({ success: false });
      else this._listLoadEndRefresh({ success: false, hasContent: !!this.data.messages.length });
      if (!initial) showErrorToast(err, { fallback: '消息加载失败，请重试' });
    } finally {
      if (generation === this._generation) this._loading = false;
    }
  },

  onSwitchFilter(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id ?? '');
    if (!notificationFilterTabs.some((tab) => tab.id === id) || id === this.data.activeFilter)
      return;
    this.setData({
      activeFilter: id,
      messages: [],
      nextCursor: '',
      headCursor: '',
    });
    void this._loadMessages();
    void wx.pageScrollTo({ scrollTop: 0, duration: 180 });
  },

  _disconnectObserver() {
    this._observer?.disconnect();
    this._observer = null;
    this._visibleIds.clear();
    if (this._readTimer !== undefined) clearTimeout(this._readTimer);
    this._readTimer = undefined;
  },

  _isCurrent(generation: number) {
    return this._visible && generation === this._generation;
  },

  _observeCards() {
    this._disconnectObserver();
    if (
      !this._visible ||
      !this._ready ||
      !this.data.messages.length ||
      this.data.listLoad.phase === 'initial' ||
      this.data.listLoad.initialError
    )
      return;
    const generation = this._generation;
    this.createSelectorQuery()
      .select('.top-bar')
      .boundingClientRect((value) => {
        const rect = value as { bottom: number } | null;
        if (!this._isCurrent(generation) || !rect) return;
        this._observer = this.createIntersectionObserver({
          observeAll: true,
          thresholds: [0, 0.5, 1],
        });
        this._observer
          .relativeToViewport({ top: -rect.bottom, bottom: -90 })
          .observe('.notification-card', (entry) => {
            if (!this._isCurrent(generation)) return;
            const id = String(entry.dataset.id ?? '');
            if (entry.intersectionRatio >= 0.5) this._visibleIds.add(id);
            else this._visibleIds.delete(id);
            this._scheduleVisibleRead();
          });
      })
      .exec();
  },

  _scheduleVisibleRead() {
    if (this._readTimer !== undefined || this._reading || this.data.markingAll) return;
    this._readTimer = setTimeout(() => {
      this._readTimer = undefined;
      void this._readVisible();
    }, 350);
  },

  async _readVisible() {
    if (!this._visible || this._reading || this.data.markingAll) return;
    const ids = this.data.messages
      .filter(
        (item) => !item.isRead && this._visibleIds.has(item.id) && !this._attemptedIds.has(item.id),
      )
      .map((item) => item.id)
      .slice(0, 50);
    if (!ids.length) return;
    ids.forEach((id) => this._attemptedIds.add(id));
    this._reading = true;
    const generation = this._generation;
    try {
      await notificationCenter.markRead(ids);
      if (!this._isCurrent(generation)) return;
      this.setData({
        messages: this.data.messages.map((item) =>
          ids.includes(item.id) ? { ...item, isRead: true } : item,
        ),
      });
    } catch {
      if (this._isCurrent(generation)) this.setData({ readError: true });
    } finally {
      if (generation === this._generation) {
        this._reading = false;
        this._scheduleVisibleRead();
      }
    }
  },

  async onRetryRead() {
    const generation = this._generation;
    try {
      await notificationCenter.retryFailedReads();
      if (!this._visible || generation !== this._generation) return;
      this.setData({ readError: false });
      this._attemptedIds.clear();
      void this._readVisible();
    } catch (err) {
      if (this._visible && generation === this._generation) {
        showErrorToast(err, { fallback: '已读同步失败，请重试' });
      }
    }
  },

  onToggleMessage(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id ?? '');
    this.setData(
      {
        messages: this.data.messages.map((item) =>
          item.id === id ? { ...item, expanded: !item.expanded } : item,
        ),
      },
      () => {
        this._observeCards();
      },
    );
  },

  onTapMessage(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id ?? '');
    const item = this.data.messages.find((message) => message.id === id);
    if (item) void notificationCenter.openNotification(item);
  },

  async onMarkAllRead() {
    if (this.data.markingAll || !this.data.headCursor) return;
    const throughCursor = this.data.headCursor;
    const owner = getUserId();
    this.setData({ markingAll: true });
    try {
      await notificationCenter.markReadThrough(throughCursor);
      if (!this._visible || owner !== getUserId()) return;
      showInfoToast('已将当前范围内的全部分类标记已读');
      await this._loadMessages();
    } catch (err) {
      if (!this._visible || owner !== getUserId()) return;
      if (isInvalidNotificationCursor(err)) {
        await this._loadMessages();
        showInfoToast('消息范围已更新，请再次点击全部已读');
      } else showErrorToast(err, { fallback: '全部已读失败，请重试' });
    } finally {
      if (this._visible && owner === getUserId()) this.setData({ markingAll: false });
    }
  },
});
