import { useSharePoster } from '../../../behaviors/useSharePoster';
// subpkg_public_event/pages/detail/detail.ts

import {
  wxSetClipboardData,
  wxPageScrollTo,
  wxPreviewImage,
  wxDownloadFile,
} from '../../../utils/wx-promise';
import * as publicEventAction from '../../actions/public-event';
import { createLogger } from '../../../utils/logger';
import type { PublicEventDetail } from '../../../types/business';
import { drawPublicEventPoster } from '../../utils/publicEventPoster';
import { showErrorToast, showSuccessToast } from '../../../utils/notify';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { navigateBackOrHome } from '../../utils/navigation';

const log = createLogger('PublicEventDetailPage');

definePage({
  behaviors: [useAsyncLoad(), useSharePoster()],

  _unloaded: false,
  _loadVersion: 0,
  _openingResource: false,

  data: {
    statusBarHeight: 20,
    publicEventId: '',
    subscriptionBusy: false,
    publicEvent: {} as PublicEventDetail,
    skeletonSections: [1, 2, 3],

    showPopup: false,
    popupType: '',
  },

  onLoad(query: { publicEventId?: string; examId?: string; from?: string }) {
    const sys = wx.getWindowInfo();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      publicEventId: query.publicEventId ?? query.examId ?? '',
    });

    void this._loadPublicEvent(query.publicEventId ?? query.examId ?? '');
  },

  onUnload() {
    this._unloaded = true;
    this._loadVersion += 1;
  },

  async _loadPublicEvent(publicEventId: string, options: { preserveError?: boolean } = {}) {
    if (!publicEventId) {
      this._asyncLoadFail('公共事项不存在');
      return;
    }

    const version = ++this._loadVersion;
    this._asyncLoadBegin(options);
    try {
      const detail = await publicEventAction.getPublicEventDetail(publicEventId);
      if (this._unloaded || version !== this._loadVersion) return;
      this.setData({
        publicEvent: detail,
      });
      this._asyncLoadSuccess();
      void wx.setNavigationBarTitle({ title: detail.title || '公共事项' });
      this._preparePublicEventShare();
    } catch (err) {
      if (this._unloaded || version !== this._loadVersion) return;
      this._asyncLoadFail('暂时无法读取该事项，请返回列表确认或重试');
      log.error('onLoad', `加载公共事项详情失败 [${publicEventId}]`, err);
    }
  },

  onRetryLoad() {
    void this._loadPublicEvent(this.data.publicEventId, { preserveError: true });
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return this._getShareContent();
  },

  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    return {
      query: `publicEventId=${this.data.publicEvent.id}&from=share`,
      imageUrl: this._getShareContent().imageUrl,
    };
  },

  onShareOpen() {
    if (!this.data.publicEvent.id) return;
    this._preparePublicEventShare();
    this.setData({ showPopup: true, popupType: 'share' });
  },
  onShareClose() {
    this.setData({ showPopup: false });
  },
  onOverlayTap() {
    this.onShareClose();
  },
  onPopupAfterLeave() {
    this.setData({ showPopup: false, popupType: '' });
  },
  noop() {
    /* block overlay touch */
  },

  _preparePublicEventShare() {
    const publicEvent = this.data.publicEvent;
    if (!publicEvent.id) return;
    const posterData = {
      name: [publicEvent.title, publicEvent.frequency].filter(Boolean).join(' · '),
      desc: publicEvent.summary || publicEvent.sections[0]?.content || '',
      dates: publicEvent.timeline.slice(0, 2).map((item) => ({
        label: item.label,
        value: item.scheduleText,
      })),
    };
    this._prepareShare({
      key: JSON.stringify([publicEvent.id, posterData]),
      path: `/subpkg_public_event/pages/detail/detail?publicEventId=${publicEvent.id}&from=share`,
      render: (scope) => drawPublicEventPoster(scope, posterData),
    });
  },

  async onViewResources() {
    if (!this.data.publicEvent.resources.length) return;
    try {
      await wxPageScrollTo({ selector: '#resources-section', duration: 300 });
    } catch (err) {
      showErrorToast(err, { fallback: '请向下滑动查看相关入口' });
    }
  },

  async onToggleSubscription() {
    if (this.data.subscriptionBusy || !this.data.publicEvent.id) return;
    const id = this.data.publicEvent.id;
    const desired = !this.data.publicEvent.subscribed;
    this.setData({ subscriptionBusy: true });
    try {
      const subscribed = await publicEventAction.setPublicEventSubscription(id, desired);
      if (this._unloaded || this.data.publicEvent.id !== id) return;
      this.setData({ 'publicEvent.subscribed': subscribed });
      showSuccessToast(subscribed ? '已订阅本期事项' : '已取消订阅');
    } catch (err) {
      if (!this._unloaded) showErrorToast(err, { fallback: '订阅操作未完成，请重试' });
    } finally {
      if (!this._unloaded) this.setData({ subscriptionBusy: false });
    }
  },

  async onOpenLink(e: WechatMiniprogram.TouchEvent) {
    if (this._openingResource) return;
    const { key } = e.currentTarget.dataset as { key: string };
    const item = this.data.publicEvent.resources.find((resource) => resource.key === key);
    if (!item?.url || item.kind === 'text') return;
    this._openingResource = true;
    try {
      if (item.kind === 'image') {
        await wxPreviewImage({ current: item.url, urls: [item.url] });
      } else if (item.kind === 'document') {
        const file = await wxDownloadFile({ url: item.url });
        if (this._unloaded) return;
        if (file.statusCode !== 200 || !file.tempFilePath) throw new Error('文件下载失败');
        const supported =
          item.fileType === 'pdf' || item.fileType === 'doc' || item.fileType === 'docx'
            ? item.fileType
            : undefined;
        await wx.openDocument({ filePath: file.tempFilePath, fileType: supported, showMenu: true });
      } else {
        await wxSetClipboardData({ data: item.url });
        if (!this._unloaded) showSuccessToast('入口信息已复制');
      }
    } catch (err) {
      if (!this._unloaded) showErrorToast(err, { fallback: '暂时无法打开，请重试' });
    } finally {
      this._openingResource = false;
    }
  },

  onBack() {
    navigateBackOrHome();
  },
});
