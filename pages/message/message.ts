import * as messageAction from '../../actions/message';
import { createLogger } from '../../utils/logger';
import type { FilterTab, MessageItem } from '../../types/business';
import { getCustomTabBar } from '../../utils/tabbar';
import { wxNavigateTo } from '../../utils/wx-promise';
import { showErrorToast, showInfoToast } from '../../utils/notify';
import {
  ROUTES,
  buildActivityDetailRoute,
  buildExamDetailRoute,
  buildPostDetailRoute,
} from '../../utils/routes';
import { useListLoad } from '../../behaviors/useListLoad';
import definePage from '../../utils/definePage';

const MESSAGE_TAB_INDEX = 1;

const log = createLogger('MessagePage');

let loadingTask: Promise<void> | null = null;

type LoadOptions = Partial<{
  fromPullDown: boolean;
  silent: boolean;
}>;

definePage({
  behaviors: [
    useListLoad({
      skeletonDelay: 140,
      minSkeletonDuration: 280,
      defaultHasMore: false,
    }),
  ],

  data: {
    // pageCopy: messageAction.getMessagePageCopy(),
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,
    bannerTop: 80,

    /** 消息卡片骨架数量。 */
    skeletonRows: [1, 2, 3],

    activeFilter: '',
    filterTabs: [] as FilterTab[],
    totalCount: 0,

    allMessages: [] as MessageItem[],
    groupedMessages: [] as MessageItem[],
    urgentMessages: [] as MessageItem[],
    olderMessages: [] as MessageItem[],
    unreadCount: 0,
  },

  onLoad() {
    this._initLayout();
    void this._loadMessages();
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      getCustomTabBar(this).init();
    }
  },

  onPullDownRefresh() {
    void this._loadMessages({ fromPullDown: true }).finally(() => {
      void wx.stopPullDownRefresh();
    });
  },

  _initLayout() {
    const sys = wx.getWindowInfo();
    const menuBtn =
      typeof wx.getMenuButtonBoundingClientRect === 'function'
        ? wx.getMenuButtonBoundingClientRect()
        : null;

    const statusBarHeight = sys.statusBarHeight || 20;
    let navTopGap = 8;
    let navHeight = 32;
    let bannerTop = 80;

    if (menuBtn?.width) {
      navTopGap = Math.max(menuBtn.top - statusBarHeight, 6);
      navHeight = menuBtn.height || navHeight;
      bannerTop = menuBtn.bottom + 16;
    }

    this.setData({
      statusBarHeight,
      navTopGap,
      navHeight,
      bannerTop,
    });
  },

  _loadMessages(options: LoadOptions = {}) {
    if (loadingTask) return loadingTask;

    const isInitial = !options.fromPullDown && !this.data.allMessages.length;
    if (isInitial) this._listLoadBeginInitial();
    else this._listLoadBeginRefresh();

    loadingTask = messageAction
      .getMessageFeedData()
      .then((data) => {
        const allMessages = data.allMessages;
        const filterTabs = data.filterTabs;
        const activeFilter = this._resolveActiveFilter(filterTabs);
        const totalCount = data.totalCount || allMessages.length;
        const unreadCount =
          data.unreadCount || allMessages.filter((m: MessageItem) => !m.isRead).length;

        this._commitMessageState({
          allMessages,
          filterTabs,
          activeFilter,
          totalCount,
          unreadCount,
        });

        if (isInitial) {
          this._listLoadEndInitial({
            success: true,
            hasContent: allMessages.length > 0,
            hasMore: false,
          });
        } else {
          this._listLoadEndRefresh({
            success: true,
            hasContent: allMessages.length > 0,
            hasMore: false,
          });
        }
      })
      .catch((err: unknown) => {
        log.error('_loadMessages', '加载消息失败', err);
        const hasContent = this.data.allMessages.length > 0;

        if (isInitial) {
          this._listLoadEndInitial({ success: false, hasContent, hasMore: false });
        } else {
          this._listLoadEndRefresh({ success: false, hasContent, hasMore: false });
        }

        // 首屏已有可操作的错误态，不再叠加 Toast；保留内容时用 Toast 反馈刷新失败。
        if (!options.silent && (!isInitial || hasContent)) {
          showErrorToast(err, { fallback: '消息加载失败，请稍后重试' });
        }
      })
      .finally(() => {
        loadingTask = null;
      });

    return loadingTask;
  },

  onRetryInitialLoad() {
    void this._loadMessages({ fromPullDown: true });
  },

  _resolveActiveFilter(filterTabs: FilterTab[]) {
    const currentFilter = this.data.activeFilter;
    if (filterTabs.some((item) => item.id === currentFilter)) {
      return currentFilter;
    }

    return filterTabs[0]?.id ?? '';
  },

  _commitMessageState(payload: {
    allMessages: MessageItem[];
    filterTabs?: FilterTab[];
    activeFilter?: string;
    totalCount?: number;
    unreadCount?: number;
  }) {
    const allMessages = payload.allMessages;
    const filterTabs = payload.filterTabs ?? messageAction.getFilterTabs(allMessages);
    const activeFilter = payload.activeFilter ?? this._resolveActiveFilter(filterTabs);
    const unreadCount =
      payload.unreadCount ?? allMessages.filter((m: MessageItem) => !m.isRead).length;
    const totalCount = payload.totalCount ?? allMessages.length;
    const sections = messageAction.applyMessageFilter(allMessages, activeFilter);

    this.setData({
      allMessages,
      filterTabs,
      activeFilter,
      totalCount,
      unreadCount,
      ...sections,
    });

    this._syncTabBarBadge(unreadCount);
  },

  _applyFilter(activeFilter?: string) {
    const currentFilter = activeFilter ?? this.data.activeFilter;
    const sections = messageAction.applyMessageFilter(this.data.allMessages, currentFilter);

    this.setData({
      activeFilter: currentFilter,
      ...sections,
    });
  },

  onSwitchFilter(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id ?? 'all');
    if (!id || id === this.data.activeFilter) return;

    this._applyFilter(id);

    void wx.pageScrollTo({
      scrollTop: 0,
      duration: 180,
    });
  },

  onTapMessage(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id ?? '');
    const targetType = String(e.currentTarget.dataset.targetType ?? '');
    const targetId = String(e.currentTarget.dataset.targetId ?? '');

    if (id) this._markRead(id);

    this._navigate(targetType, targetId);
  },

  onTapGroupedMessage(e: WechatMiniprogram.TouchEvent) {
    const targetType = String(e.currentTarget.dataset.targetType ?? '');
    const targetId = String(e.currentTarget.dataset.targetId ?? '');
    this._navigate(targetType, targetId);
  },

  _markRead(id: string) {
    const current = this.data.allMessages.find((m: MessageItem) => m.id === id);
    if (!current || current.isRead) return;

    const previousMessages = this.data.allMessages;
    const nextMessages = previousMessages.map((m: MessageItem) =>
      m.id === id ? { ...m, isRead: true } : m,
    );

    this._commitMessageState({
      allMessages: nextMessages,
      activeFilter: this.data.activeFilter,
    });

    void messageAction.markMessageAsRead(id).catch((err: unknown) => {
      log.error('_markRead', '标记消息已读失败', err);
      this._commitMessageState({
        allMessages: previousMessages,
        activeFilter: this.data.activeFilter,
      });
    });
  },

  onMarkAllRead() {
    if (!this.data.unreadCount) return;

    const previousMessages = this.data.allMessages;
    const nextMessages = previousMessages.map((m: MessageItem) => ({ ...m, isRead: true }));

    this._commitMessageState({
      allMessages: nextMessages,
      activeFilter: this.data.activeFilter,
      unreadCount: 0,
    });

    void messageAction
      .markAllMessagesAsRead()
      .then(() => {
        showInfoToast('已全部标记已读');
      })
      .catch((err: unknown) => {
        log.error('onMarkAllRead', '全部已读失败', err);
        this._commitMessageState({
          allMessages: previousMessages,
          activeFilter: this.data.activeFilter,
        });
        showErrorToast(err, { fallback: '操作失败，请稍后重试' });
      });
  },

  _syncTabBarBadge(totalUnread: number) {
    if (totalUnread > 0) {
      void wx.setTabBarBadge({
        index: MESSAGE_TAB_INDEX,
        text: totalUnread > 99 ? '99+' : String(totalUnread),
      });
    } else {
      void wx.removeTabBarBadge({ index: MESSAGE_TAB_INDEX });
    }
  },

  _navigate(targetType: string, targetId: string) {
    // if (targetType === TARGET_TYPES.COMMENT.value) return; // 评论类消息只标记已读，不跳转

    const normalizedType = (targetType || '').toLowerCase();
    if (!normalizedType || normalizedType === 'none') return;

    if (normalizedType === 'notification_center') {
      void wx.switchTab({ url: ROUTES.MESSAGE });
      return;
    }

    if (!targetId) return;

    const routes: Record<string, string> = {
      activity: buildActivityDetailRoute(targetId),
      exam: buildExamDetailRoute(targetId),
      post: buildPostDetailRoute(targetId),
    };

    const url = routes[normalizedType];
    if (url)
      wxNavigateTo({ url }).catch((err: unknown) => {
        log.error('_navigate', '跳转目标页失败', { targetType, targetId }, err);
      });
  },
});
