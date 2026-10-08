import { useSharePoster } from '../../../behaviors/useSharePoster';
// subpkg_activity/pages/detail/detail.ts

import {
  wxDownloadFile,
  wxPageScrollTo,
  wxPreviewImage,
  wxSetClipboardData,
  wxShowModal,
} from '../../../utils/wx-promise';
import { createLogger } from '../../../utils/logger';
import type { ActivityDetail } from '../../../types/business';
import { drawActivityPoster } from '../../utils/activityPoster';
import * as activityAction from '../../actions/activity';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../../utils/notify';
import { navigateBackOrHome } from '../../utils/navigation';
import { resolveDetailPrimaryAction, type DetailPrimaryAction } from './detail-actions';

const log = createLogger('ActivityDetailPage');
const DOCUMENT_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const;
const IMAGE_TYPES = ['image', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

function isDocumentType(type: string): type is (typeof DOCUMENT_TYPES)[number] {
  return DOCUMENT_TYPES.some((item) => item === type);
}

definePage({
  behaviors: [useAsyncLoad(), useSharePoster()],

  /** 滚动位置快照，用于弹窗锁定页面时记录当前位置 */
  _currentScrollTop: 0,
  _openingAttachment: false,
  _unloaded: false,
  _loadVersion: 0,
  _registrationPageOpened: false,

  data: {
    statusBarHeight: 20,
    activity: {} as ActivityDetail,
    showPopup: false,
    popupType: '',
    lockScrollTop: 0,
    currentActivityId: '',
    skeletonSections: [1, 2, 3],
    subscriptionBusy: false,
    registrationStatus: '',
    primaryAction: null as DetailPrimaryAction | null,
  },

  onRegistration() {
    this._registrationPageOpened = true;
    wx.navigateTo({
      url: `/subpkg_activity/pages/registration/registration?activityId=${encodeURIComponent(this.data.currentActivityId)}`,
      fail: () => {
        this._registrationPageOpened = false;
        showInfoToast('报名页面暂时无法打开，请重试');
      },
    });
  },

  onPrimaryAction() {
    const primaryAction = this.data.primaryAction;
    if (!primaryAction || primaryAction.disabled) return;
    if (primaryAction.kind === 'registration') {
      this.onRegistration();
      return;
    }
    if (primaryAction.kind === 'external-actions') {
      void this.onScrollToExternalActions();
      return;
    }
    void this.onScrollToJoin();
  },

  // ── 空操作占位（供 wxml 绑定用） ──────────────────────────
  noop() {
    /* empty */
  },

  // ── 弹窗控制 ──────────────────────────────────────────────
  _openPopup(patch: Record<string, unknown>) {
    const scrollTop = this._currentScrollTop;
    this.setData({
      ...patch,
      lockScrollTop: scrollTop,
      showPopup: true,
    });
  },

  _closePopup(resetType = false) {
    const patch: Record<string, unknown> = { showPopup: false };
    if (resetType) patch.popupType = '';
    this.setData(patch);
  },

  // ── 生命周期 ──────────────────────────────────────────────
  onLoad(options: { activityId: string; from?: string }) {
    this._currentScrollTop = 0;
    this._openingAttachment = false;
    this._unloaded = false;

    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({
      statusBarHeight,
      currentActivityId: options.activityId || '',
    });

    this._loadActivity(options.activityId);
  },

  onShow() {
    if (!this._registrationPageOpened) return;
    this._registrationPageOpened = false;
    this._loadActivity(this.data.currentActivityId, { preserveError: true });
  },

  onUnload() {
    this._unloaded = true;
    this._loadVersion += 1;
    if (this._openingAttachment) void wx.hideLoading();
  },

  onPageScroll(e: WechatMiniprogram.Page.IPageScrollOption) {
    if (this.data.showPopup) return;
    this._currentScrollTop = e.scrollTop;
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return this._getShareContent();
  },

  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const { id } = this.data.activity;
    return {
      query: `activityId=${id}&from=share`,
      imageUrl: this._getShareContent().imageUrl,
    };
  },

  // ── 数据加载 ──────────────────────────────────────────────
  _loadActivity(id: string, options: { preserveError?: boolean } = {}) {
    if (!id) {
      this._asyncLoadFail('活动不存在');
      return;
    }

    const version = ++this._loadVersion;
    this._asyncLoadBegin(options);

    activityAction
      .getActivityDetailState(id)
      .then(({ activity, registrationStatus }) => {
        if (this._unloaded || version !== this._loadVersion) return;
        this.setData(
          {
            activity,
            registrationStatus,
            primaryAction: resolveDetailPrimaryAction(
              activity.registrationMode,
              activity.availability,
              registrationStatus,
            ),
            currentSharePath: `/subpkg_activity/pages/detail/detail?activityId=${activity.id}&from=share`,
          },
          () => {
            if (this._unloaded || version !== this._loadVersion) return;
            this._asyncLoadSuccess();
            void wx.setNavigationBarTitle({ title: activity.title });
            this._prepareActivityShare();
          },
        );
      })
      .catch((err: unknown) => {
        if (this._unloaded || version !== this._loadVersion) return;
        this._asyncLoadFail('活动暂时无法查看，可能已下架或请求失败，请稍后重试');
        log.error('_loadActivity', '加载活动失败', err);
      });
  },

  _prepareActivityShare() {
    const activity = this.data.activity;
    if (!activity.id) return;

    const activityData = {
      title: activity.title,
      time: activity.start_time,
      location: activity.location,
      maxPeople: activity.max_participants,
      capacityText: activity.capacityText === '未提供' ? '' : activity.capacityText,
      cover: activity.cover ?? '',
    };

    this._prepareShare({
      key: JSON.stringify([activity.id, activityData]),
      path: `/subpkg_activity/pages/detail/detail?activityId=${activity.id}&from=share`,
      render: (scope) => drawActivityPoster(scope, activityData),
    });
  },

  // ── 用户操作 ──────────────────────────────────────────────
  async onToggleSubscription() {
    if (this.data.subscriptionBusy || !this.data.activity.id) return;
    const id = this.data.activity.id;
    const desired = !this.data.activity.subscribed;
    this.setData({ subscriptionBusy: true });
    try {
      const subscribed = await activityAction.setActivitySubscription(id, desired);
      if (this._unloaded || this.data.activity.id !== id) return;
      this.setData({ 'activity.subscribed': subscribed });
      showSuccessToast(subscribed ? '已订阅活动' : '已取消订阅');
    } catch (err) {
      if (!this._unloaded) showErrorToast(err, { fallback: '订阅操作未完成，请重试' });
    } finally {
      if (!this._unloaded) this.setData({ subscriptionBusy: false });
    }
  },

  onRetryDetail() {
    this._loadActivity(this.data.currentActivityId, { preserveError: true });
  },

  async _copyText(text: string, label: string) {
    if (!text.trim()) {
      showInfoToast(`暂无${label}`);
      return;
    }
    try {
      await wxSetClipboardData({ data: text });
      showSuccessToast(`${label}已复制`);
    } catch (err) {
      log.warn('_copyText', '复制失败', err);
      showInfoToast('复制失败，请重试');
    }
  },

  onCopy(e: WechatMiniprogram.TouchEvent) {
    const { text, label } = e.currentTarget.dataset as { text?: string; label?: string };
    return this._copyText(text ?? '', label ?? '内容');
  },

  async _offerAttachmentLink(url: string, content: string) {
    try {
      const result = await wxShowModal({
        title: '查看附件',
        content,
        confirmText: '复制链接',
        cancelText: '取消',
      });
      if (result.confirm && !this._unloaded) await this._copyText(url, '附件链接');
    } catch (err) {
      log.warn('_offerAttachmentLink', '显示附件提示失败', err);
    }
  },

  async onOpenAttachment(e: WechatMiniprogram.TouchEvent) {
    if (this._openingAttachment) return;
    const index = Number(e.currentTarget.dataset.index);
    const attachment = this.data.activity.attachments.find((_, itemIndex) => itemIndex === index);
    if (!attachment?.url.trim()) {
      showInfoToast('附件地址未提供');
      return;
    }

    const url = attachment.url.trim();
    const type = attachment.type.toLowerCase();
    if (!IMAGE_TYPES.includes(type) && !isDocumentType(type)) {
      await this._offerAttachmentLink(
        url,
        '该附件暂不支持在小程序内预览，可复制链接到浏览器查看。',
      );
      return;
    }

    this._openingAttachment = true;
    let failureMessage = '';
    try {
      if (IMAGE_TYPES.includes(type)) {
        await wxPreviewImage({
          current: url,
          urls: this.data.activity.attachments
            .filter((item) => IMAGE_TYPES.includes(item.type.toLowerCase()) && item.url.trim())
            .map((item) => item.url.trim()),
        });
      } else if (isDocumentType(type)) {
        void wx.showLoading({ title: '正在下载附件', mask: true });
        const result = await wxDownloadFile({ url });
        if (this._unloaded) return;
        if (result.statusCode !== 200 || !result.tempFilePath) {
          throw new Error(`附件下载失败：HTTP ${String(result.statusCode)}`);
        }
        void wx.hideLoading();
        await wx.openDocument({
          filePath: result.tempFilePath,
          fileType: type,
          showMenu: true,
        });
      }
    } catch (err) {
      log.warn('onOpenAttachment', '附件查看失败', err);
      failureMessage = '附件暂时无法打开，请稍后重试，或复制链接到浏览器查看。';
    } finally {
      if (!this._unloaded && isDocumentType(type)) void wx.hideLoading();
      this._openingAttachment = false;
    }
    if (failureMessage && !this._unloaded) await this._offerAttachmentLink(url, failureMessage);
  },

  async onPreviewQRCode() {
    const url = this.data.activity.qrcode_url;
    if (!url) return;
    try {
      await wxPreviewImage({ current: url, urls: [url] });
    } catch (err) {
      log.warn('onPreviewQRCode', '二维码预览失败', err);
      showInfoToast('二维码暂时无法预览，请重试');
    }
  },

  async onScrollToJoin() {
    try {
      await wxPageScrollTo({ selector: '#join-section', duration: 300 });
    } catch (err) {
      log.warn('onScrollToJoin', '定位参与入口失败', err);
      showInfoToast('请向下滑动查看参与方式');
    }
  },

  async onScrollToExternalActions() {
    try {
      await wxPageScrollTo({ selector: '#external-actions', duration: 300 });
    } catch (err) {
      log.warn('onScrollToExternalActions', '定位后续参与步骤失败', err);
      await this.onScrollToJoin();
    }
  },

  onOverlayTap() {
    this._closePopup();
  },

  onShareClose() {
    this._closePopup();
  },

  onPopupAfterLeave() {
    this._closePopup(true);
  },

  onShare() {
    if (!this.data.activity.id) return;
    this._prepareActivityShare();
    this._openPopup({
      popupType: 'share',
    });
  },

  onBack() {
    navigateBackOrHome();
  },
});
