// subpkg_activity/pages/detail/detail.ts

import { wxShowActionSheet } from '../../../utils/wx-promise';
import { createLogger } from '../../../utils/logger';
import type { ActivityDetail } from '../../../types/business';
import { drawActivityPoster } from '../../utils/activityPoster';
import { activityAction } from '../../../actions/index';
import { useAsyncLoad } from '../../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { showInfoToast, showSuccessToast } from '../../../utils/notify';
import { navigateBackOrHome } from '../../../utils/navigation';

const log = createLogger('ActivityDetailPage');

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
  behaviors: [useAsyncLoad()],

  /** 滚动位置快照，用于弹窗锁定页面时记录当前位置 */
  _currentScrollTop: 0,

  data: {
    statusBarHeight: 20,
    activity: {} as ActivityDetail,
    showPopup: false,
    popupType: '',
    lockScrollTop: 0,
    currentShareImage: '',
    currentSharePath: '',
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

    const { statusBarHeight } = wx.getWindowInfo();
    this.setData({
      statusBarHeight,
      currentActivityId: options.activityId || '',
    });

    this._loadActivity(options.activityId);
  },

  onPageScroll(e: WechatMiniprogram.Page.IPageScrollOption) {
    if (this.data.showPopup) return;
    this._currentScrollTop = e.scrollTop;
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const { id } = this.data.activity;
    const currentShareImage = this.data.currentShareImage;
    return {
      // title: content.slice(0, 30) || '校园圈动态',
      path: `/subpkg_activity/pages/detail/detail?activityId=${id}&from=share`,
      imageUrl: currentShareImage || '',
    };
  },

  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    const { id } = this.data.activity;
    const currentShareImage = this.data.currentShareImage;
    return {
      // title: content.slice(0, 30) || '校园圈动态',
      query: `activityId=${id}&from=share`,
      imageUrl: currentShareImage || '',
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
          },
          () => {
            this._asyncLoadSuccess();
            void wx.setNavigationBarTitle({ title: res.title });
            void this._drawActivityPoster();
          },
        );
      })
      .catch((err: unknown) => {
        this._asyncLoadFail('网络可能暂时不可用，请稍后再试');
        log.error('_loadActivity', '加载活动失败', err);
      });
  },

  async _drawActivityPoster() {
    const activity = this.data.activity;
    if (!activity.id) return;

    const activityData = {
      title: activity.title,
      time: activity.start_time,
      location: activity.location,
      maxPeople: activity.max_participants,
      cover: activity.cover ?? '',
    };

    await drawActivityPoster(this, activityData, (posterPath) => {
      this.setData({
        currentShareImage: posterPath,
        currentSharePath: `/subpkg_activity/pages/detail/detail?activityId=${activity.id}&from=share`,
      });
    });
  },

  // ── 用户操作 ──────────────────────────────────────────────
  onRetryDetail() {
    this._loadActivity(this.data.currentActivityId, { preserveError: true });
  },

  onEnroll() {
    showSuccessToast('报名成功');
  },

  onShare() {
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
