// subpkg_public_event/pages/list/list.ts

import type { PublicEventCard } from '../../../types/business';
import * as publicEventAction from '../../actions/public-event';
import { wxGetWindowInfo, wxNavigateTo } from '../../../utils/wx-promise';
import { navigateBackOrHome } from '../../utils/navigation';

Page({
  _version: 0,
  _unloaded: false,
  _searchTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  data: {
    statusBarHeight: 20,
    navTopGap: 8,
    navHeight: 32,
    keyword: '',
    loading: true,
    error: '',
    hasMore: false,
    nextCursor: '',
    publicEvents: [] as PublicEventCard[],
    searchResult: [] as PublicEventCard[],
  },

  onLoad() {
    const sys = wxGetWindowInfo();
    const menuButton =
      typeof wx.getMenuButtonBoundingClientRect === 'function'
        ? wx.getMenuButtonBoundingClientRect()
        : null;

    const statusBarHeight = sys.statusBarHeight || 20;
    let navTopGap = 8;
    let navHeight = 32;

    if (menuButton?.width) {
      navTopGap = Math.max(menuButton.top - statusBarHeight, 6);
      navHeight = menuButton.height || navHeight;
    }

    this.setData({
      statusBarHeight,
      navTopGap,
      navHeight,
    });
  },

  onShow() {
    void this._loadPublicEvents();
  },

  onUnload() {
    this._unloaded = true;
    this._version++;
    if (this._searchTimer) clearTimeout(this._searchTimer);
  },

  _isCurrent(version: number) {
    return !this._unloaded && version === this._version;
  },

  async _loadPublicEvents(append = false) {
    if (this._unloaded || (append && (this.data.loading || !this.data.hasMore))) return;
    const version = ++this._version;
    const keyword = this.data.keyword;
    this.setData({ loading: true, error: '' });
    try {
      const result = await publicEventAction.getPublicEventCards({
        keyword,
        pageSize: 20,
        lastId: append ? this.data.nextCursor : undefined,
      });
      if (!this._isCurrent(version)) return;
      const previous = append ? (keyword ? this.data.searchResult : this.data.publicEvents) : [];
      const ids = new Set(previous.map((item) => item.id));
      const items = [...previous, ...result.items.filter((item) => !ids.has(item.id))];
      this.setData({
        ...(keyword ? { searchResult: items } : { publicEvents: items }),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore && !!result.nextCursor,
      });
    } catch {
      if (this._isCurrent(version)) this.setData({ error: '公共事项加载失败，请重试' });
    } finally {
      if (this._isCurrent(version)) this.setData({ loading: false });
    }
  },
  onSearch(e: WechatMiniprogram.Input) {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._version++;
    this.setData({
      keyword: e.detail.value.trim(),
      searchResult: [],
      hasMore: false,
      loading: true,
      error: '',
    });
    this._searchTimer = setTimeout(() => void this._loadPublicEvents(), 300);
  },
  onClearSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.setData({ keyword: '', searchResult: [] });
    void this._loadPublicEvents();
  },
  onReachBottom() {
    void this._loadPublicEvents(true);
  },
  onRetryLoad() {
    void this._loadPublicEvents();
  },

  onBack() {
    navigateBackOrHome();
  },

  goDetail(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as { id: string };
    void wxNavigateTo({
      url: `/subpkg_public_event/pages/detail/detail?publicEventId=${encodeURIComponent(id)}`,
    });
  },
});
