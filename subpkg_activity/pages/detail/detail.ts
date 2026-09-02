import { useSharePoster } from '../../../behaviors/useSharePoster';
// subpkg_activity/pages/detail/detail.ts

import {
  wxDownloadFile,
  wxPageScrollTo,
  wxPreviewImage,
  wxSetClipboardData,
  wxShowActionSheet,
  wxShowModal,
} from '../../../utils/wx-promise';
import { createLogger } from '../../../utils/logger';
import type { ActivityDetail } from '../../../types/business';
import { drawActivityPoster } from '../../utils/activityPoster';
import * as activityAction from '../../actions/activity';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { showInfoToast, showSuccessToast } from '../../../utils/notify';
import { navigateBackOrHome } from '../../utils/navigation';

const log = createLogger('ActivityDetailPage');
const DOCUMENT_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const;
const IMAGE_TYPES = ['image', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

function isDocumentType(type: string): type is (typeof DOCUMENT_TYPES)[number] {
  return DOCUMENT_TYPES.some((item) => item === type);
}

// ============================================================
// § 1  基础子类型
// ============================================================

export interface Contact {
  name: string;
  role: string;
  phone: string;
  qq: string;
  email: string;
  note: string;
}

export interface Attachment {
  /** 文件类型，如 'pdf' | 'doc' | 'image' 等 */
  type: string;
  name: string;
  url: string;
  note: string;
}

export interface Reward {
  level: string;
  /** 获奖名额，为 null 时表示若干名 */
  count: number | null;
  prize: string;
  note: string;
}

// ============================================================
// § 2  参与方式（联合类型，按 type 判别）
// ============================================================

interface JoinMethodBase {
  label: string;
  note: string;
}

export interface JoinMethodQQ extends JoinMethodBase {
  type: 'qq';
  group_id: string;
}

export interface JoinMethodEmail extends JoinMethodBase {
  type: 'email';
  email: string;
}

export interface JoinMethodQRCode extends JoinMethodBase {
  type: 'qrcode';
  image_url: string;
}

export interface JoinMethodWeChat extends JoinMethodBase {
  type: 'wechat';
  account: string;
}

export interface JoinMethodLink extends JoinMethodBase {
  type: 'link';
  url: string;
}

export type JoinMethod =
  | JoinMethodQQ
  | JoinMethodEmail
  | JoinMethodQRCode
  | JoinMethodWeChat
  | JoinMethodLink;

// ============================================================
// § 3  时间轴
// ============================================================

/** 后端原始时间轴节点 */
export interface TimelineItem {
  label: string;
  /** YYYY-MM-DD，可为空字符串（日期待定） */
  date: string;
  time: string;
  source: string;
  note: string;
}

/** injectTimelineStatus 处理后注入的状态字段 */
export type TimelineStatus = 'done' | 'active' | 'pending';

/** 页面渲染用时间轴节点 */
export interface TimelineItemWithStatus extends TimelineItem {
  status: TimelineStatus;
}

// ============================================================
// § 4  后端原始活动数据（对接接口时按实际返回完善）
// ============================================================

export interface ActivityRaw {
  id: string;
  title: string;
  cover: string;
  /** 活动类型，如 '打卡' | '竞赛' | '志愿' 等 */
  type: string;
  /** 参与范围 */
  scope: string;
  organizer: string;
  co_organizer: string;
  summary: string;
  description: string;
  /** 报名开始时间，可为空字符串 */
  enroll_start: string;
  /** 报名截止时间，格式 'YYYY-MM-DD HH:mm'，可为空字符串 */
  enroll_deadline: string;
  /** 活动开始时间，格式 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm' */
  start_time: string;
  /** 活动结束时间 */
  end_time: string;
  location: string;
  /** 人数上限，null 表示不限 */
  max_participants: number | null;
  timeline: TimelineItem[];
  rewards: Reward[];
  join_methods: JoinMethod[];
  contacts: Contact[];
  attachments: Attachment[];
  series_id: string;
  series_name: string;
  /** 文件来源，如 '信团发〔2026〕7号' */
  source: string;
  published_at: string;
  published_by: string;
  is_cancelled: boolean;
}

// ============================================================
// § 5  前端视图模型（ActivityRaw + 本地计算字段）
// ============================================================

export interface ActivityViewModel extends ActivityRaw {
  /** 当前活动状态码，由 calcActivityStatus 计算 */
  status: string;
  /** 状态展示文本，由 STATUS_LABEL 映射 */
  statusLabel: string;
  /**  距报名截止剩余天数，无截止时间时为 null */
  daysToDeadline: number | null;
  /** 已注入状态的时间轴（覆盖父类原始类型） */
  timeline: TimelineItemWithStatus[];
  /** 类型色标，由 TYPE_MAP 映射 */
  typeColor: string;
  /** 类型图标 emoji */
  typeIcon: string;
  /** 格式化后的简短开始日期，用于卡片展示 */
  startDateShort: string;
}

// ============================================================
// § 6  接口响应结构（对接时按后端实际格式调整）
// ============================================================

export interface ActivityDetailResponse {
  data: ActivityRaw;
}

// ============================================================
// § 9  Page 实现
// ============================================================

definePage({
  behaviors: [useAsyncLoad(), useSharePoster()],

  /** 滚动位置快照，用于弹窗锁定页面时记录当前位置 */
  _currentScrollTop: 0,
  _openingAttachment: false,
  _unloaded: false,

  data: {
    statusBarHeight: 20,
    activity: {} as ActivityDetail,
    showPopup: false,
    popupType: '',
    lockScrollTop: 0,
    currentActivityId: '',
    skeletonSections: [1, 2, 3],
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

  onUnload() {
    this._unloaded = true;
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

    this._asyncLoadBegin(options);

    activityAction
      .getActivityDetail(id)
      .then((res) => {
        this.setData(
          {
            activity: res,
            currentSharePath: `/subpkg_activity/pages/detail/detail?activityId=${res.id}&from=share`,
          },
          () => {
            this._asyncLoadSuccess();
            void wx.setNavigationBarTitle({ title: res.title });
            this._prepareActivityShare();
          },
        );
      })
      .catch((err: unknown) => {
        this._asyncLoadFail('网络可能暂时不可用，请稍后再试');
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
      cover: activity.cover ?? '',
    };

    this._prepareShare({
      key: JSON.stringify([activity.id, activityData]),
      path: `/subpkg_activity/pages/detail/detail?activityId=${activity.id}&from=share`,
      render: (scope) => drawActivityPoster(scope, activityData),
    });
  },

  // ── 用户操作 ──────────────────────────────────────────────
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
      log.warn('onScrollToJoin', '定位报名方式失败', err);
      showInfoToast('请向下滑动查看报名方式');
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

  onEnroll() {
    showSuccessToast('报名成功');
  },

  onShare() {
    if (!this.data.activity.id) return;
    this._prepareActivityShare();
    this._openPopup({
      popupType: 'share',
    });
  },

  async onMore() {
    const res = await wxShowActionSheet({
      itemList: ['举报', '不感兴趣'],
    });

    if (res.tapIndex === 0) {
      showInfoToast('举报已提交');
    }
  },

  onBack() {
    navigateBackOrHome();
  },
});
