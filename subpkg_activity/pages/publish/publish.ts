// subpkg_activity/pages/publish/publish.ts

import { MEDIA_TYPES, TARGET_TYPES, type MediaType } from '../../../utils/constants';
import { activityAction, mediaAction } from '../../../actions/index';
import { createLogger } from '../../../utils/logger';
import { notifyToast } from '../../../utils/notify';
import type { SelectedMediaFile } from '../../../actions/media';
import type {
  ActivityCreateRequest,
  AttachmentItemRequest,
  TimelineItemRequest,
} from '../../../types/api';

const log = createLogger('PublishActivityPage');

type UserLockedFields = Partial<Record<FormFieldKey, boolean>>;

type AiFieldKey =
  | 'title'
  | 'category'
  | 'organizer'
  | 'audienceScope'
  | 'startTime'
  | 'endTime'
  | 'enrollDeadline'
  | 'maxParticipants'
  | 'location'
  | 'joinMethod'
  | 'contactInfo'
  | 'timelineItems'
  | 'content';

type FormFieldKey =
  | 'title'
  | 'category'
  | 'organizer'
  | 'audienceScope'
  | 'startTime'
  | 'endTime'
  | 'enrollDeadline'
  | 'maxParticipants'
  | 'location'
  | 'joinMethod'
  | 'contactInfo'
  | 'timeline'
  | 'content'
  | 'qrcodeUrl';

type AiPhase = 'idle' | 'uploading' | 'thinking' | 'filling' | 'done' | 'error';

interface CategoryOption {
  label: string;
  value: number;
}

interface AudienceOption {
  label: string;
  bit: number;
  selected: boolean;
}

interface AiFile {
  name: string;
  path: string;
  size: number;
  sizeText: string;
  ext: 'pdf' | 'doc' | 'docx';
}

interface ContactItem {
  name: string;
  phone: string;
  expanded?: boolean;
}

interface TimelineItem {
  label: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  sortOrder: number;
  expanded?: boolean;
}

interface QrcodeImage {
  path: string;
  previewUrl: string;
  url?: string;
  status: 'local' | 'uploading' | 'uploaded' | 'error';
}

type UploadStatus = 'uploading' | 'uploaded' | 'failed';
interface ActivityAttachmentFile {
  name: string;
  path: string;
  url?: string;
  size: number;
  sizeText: string;
  ext: string;
  status: UploadStatus;
  uploadError?: string;
}

function resolveAttachmentMediaType(ext: string): MediaType {
  const normalized = ext.toLowerCase();
  if (normalized === 'pdf') return MEDIA_TYPES.PDF.value;
  if (normalized === 'doc' || normalized === 'docx') return MEDIA_TYPES.WORD.value;
  return MEDIA_TYPES.IMAGE.value;
}

/* ActivityForm 接口已移除，页面直接使用内联类型 */

interface AiStatus {
  phase: AiPhase;
  text: string;
  activeField: AiFieldKey | '';
  activeLabel: string;
  activeSubText: string;
  skippedLabels: string[];
}

interface AiStreamEvent {
  /** 后端可能返回 camelCase，也可能返回 snake_case，所以这里先放宽为 string，进入处理前再归一化 */
  f?: AiFieldKey;
  v?: unknown;
  type?: string;
  message?: string;
  m?: string;
  done?: boolean;
  append?: boolean;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: '其他', value: 0 },
  { label: '文体比赛', value: 1 },
  { label: '志愿公益', value: 2 },
  { label: '思政主题', value: 3 },
  { label: '学术讲座', value: 4 },
  { label: '体育运动', value: 5 },
];

const AUDIENCE_OPTIONS_BASE: AudienceOption[] = [
  { label: '全院', bit: 0, selected: false },
  { label: '信息', bit: 1, selected: false },
  { label: '理工', bit: 2, selected: false },
  { label: '财经', bit: 3, selected: false },
  { label: '人文', bit: 4, selected: false },
  { label: '基础', bit: 5, selected: false },
];

const FIELD_LABEL_MAP: Record<AiFieldKey, string> = {
  title: '活动标题',
  category: '活动分类',
  organizer: '主办/承办单位',
  audienceScope: '参与范围',
  startTime: '活动开始时间',
  endTime: '活动结束时间',
  enrollDeadline: '报名截止时间',
  maxParticipants: '最大参与人数',
  location: '活动地点',
  joinMethod: '参与方式',
  contactInfo: '联系人',
  timelineItems: '活动时间线',
  content: '活动详情',
};

const AI_TO_FORM_FIELD_MAP: Record<AiFieldKey, FormFieldKey> = {
  title: 'title',
  category: 'category',
  organizer: 'organizer',
  audienceScope: 'audienceScope',
  startTime: 'startTime',
  endTime: 'endTime',
  enrollDeadline: 'enrollDeadline',
  maxParticipants: 'maxParticipants',
  location: 'location',
  joinMethod: 'joinMethod',
  contactInfo: 'contactInfo',
  timelineItems: 'timeline',
  content: 'content',
};

const THINKING_TEXTS = [
  'AI 正在阅读活动文件...',
  'AI 正在识别活动标题和分类...',
  'AI 正在提取时间、地点和参与方式...',
  'AI 正在整理联系人与活动时间线...',
  'AI 正在准备填写表单...',
];

// 滚动到表单字段的选择器
const AI_FIELD_SELECTOR_MAP: Record<AiFieldKey, string> = {
  title: '#field-title',
  category: '#field-category',
  organizer: '#field-organizer',
  audienceScope: '#field-audienceScope',
  startTime: '#field-startTime',
  endTime: '#field-endTime',
  enrollDeadline: '#field-enrollDeadline',
  maxParticipants: '#field-maxParticipants',
  location: '#field-location',
  joinMethod: '#field-joinMethod',
  contactInfo: '#field-contactInfo',
  timelineItems: '#field-timelineItems',
  content: '#field-content',
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSize(size: number) {
  if (!size) return '0 KB';

  if (size < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(size / 1024)))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getExt(name: string) {
  return (name || '').split('.').pop()?.toLowerCase() ?? '';
}

function isAllowedDocExt(ext: string) {
  return ['pdf', 'doc', 'docx'].includes(ext);
}

function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

function normalizeDateTime(value: string) {
  const normalized = normalizeDateTimeForApi(value);

  if (!normalized) {
    return {
      date: todayDate(),
      time: '00:00',
    };
  }

  const [date, timeRaw = '00:00:00'] = normalized.split(' ');
  const [hh = '00', mm = '00'] = timeRaw.split(':');

  return {
    date,
    time: `${hh}:${mm}`,
  };
}

function combineDateTime(date: string, time: string) {
  return `${date} ${time}:00`;
}

function pad2(value: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '00';
  return String(Math.max(0, Math.min(99, Math.trunc(num)))).padStart(2, '0');
}

/**
 * 后端 LocalDateTime 当前需要 yyyy-MM-dd HH:mm:ss
 * 兼容：
 * 2025-10-10
 * 2025-10-10 10:00
 * 2025-10-10 10:00:00
 * 2025-10-10T10:00
 * 2025/10/10 10:00
 */
function normalizeDateTimeForApi(value: unknown) {
  if (value === null || value === undefined) return '';

  const text = toText(value).trim();
  if (!text) return '';

  const normalized = text.replace(/\//g, '-').replace('T', ' ');
  const [dateRaw = '', timeRaw = '00:00:00'] = normalized.split(/\s+/);

  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateRaw)) {
    return text;
  }

  const [year = '', month = '', day = ''] = dateRaw.split('-');
  const [hh = '00', mm = '00', ss = '00'] = timeRaw.split(':');

  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function isMainDateTimeField(field: FormFieldKey) {
  return field === 'startTime' || field === 'endTime' || field === 'enrollDeadline';
}

function buildAudienceMask(options: AudienceOption[]) {
  return options.reduce((mask, item) => {
    if (!item.selected) return mask;
    return mask | (1 << item.bit);
  }, 0);
}

function buildAudienceOptionsFromMask(mask: number) {
  const hasFull = Boolean(mask & 1);

  return AUDIENCE_OPTIONS_BASE.map((item) => {
    if (hasFull) {
      return {
        ...item,
        selected: item.bit === 0,
      };
    }

    return {
      ...item,
      selected: Boolean(mask & (1 << item.bit)),
    };
  });
}

const AI_FIELD_ALIAS_MAP: Record<string, AiFieldKey> = {
  title: 'title',
  category: 'category',
  organizer: 'organizer',
  audienceScope: 'audienceScope',
  audience_scope: 'audienceScope',
  startTime: 'startTime',
  start_time: 'startTime',
  endTime: 'endTime',
  end_time: 'endTime',
  enrollDeadline: 'enrollDeadline',
  enroll_deadline: 'enrollDeadline',
  maxParticipants: 'maxParticipants',
  max_participants: 'maxParticipants',
  location: 'location',
  joinMethod: 'joinMethod',
  join_method: 'joinMethod',
  contactInfo: 'contactInfo',
  contact_info: 'contactInfo',
  timelineItems: 'timelineItems',
  timeline_items: 'timelineItems',
  timeline: 'timelineItems',
  content: 'content',
};

function normalizeAiFieldKey(field: unknown): AiFieldKey | null {
  if (typeof field !== 'string') return null;
  return AI_FIELD_ALIAS_MAP[field] ?? null;
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const text = value.trim();
  if (!text) return '';

  if (!['[', '{'].includes(text[0])) return value;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toCategoryValue(value: unknown): number {
  const parsed = parseJsonIfString(value);

  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;

  const text = toText(parsed).trim();
  if (!text) return 0;

  const num = Number(text);
  if (Number.isFinite(num)) return num;

  const option = CATEGORY_OPTIONS.find((item) => item.label === text);
  return option?.value ?? 0;
}

function toAudienceMask(value: unknown): number {
  const parsed: unknown = parseJsonIfString(value);

  if (typeof parsed === 'number' && Number.isFinite(parsed)) {
    return parsed;
  }

  if (typeof parsed === 'string') {
    const text = parsed.trim();
    if (!text) return 0;

    const num = Number(text);
    if (Number.isFinite(num)) return num;

    return AUDIENCE_OPTIONS_BASE.reduce<number>((mask, option) => {
      return text.includes(option.label) ? mask | (1 << option.bit) : mask;
    }, 0);
  }

  if (!Array.isArray(parsed)) {
    return 0;
  }

  const items: unknown[] = parsed;

  return items.reduce<number>((mask, item) => {
    if (typeof item === 'number' && Number.isFinite(item)) {
      return mask | (1 << item);
    }

    const text = toText(item).trim();
    if (!text) return mask;

    const option = AUDIENCE_OPTIONS_BASE.find((scope) => scope.label === text);
    return option ? mask | (1 << option.bit) : mask;
  }, 0);
}

function toContactList(value: unknown): ContactItem[] {
  const parsed: unknown = parseJsonIfString(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const items: unknown[] = parsed;

  return items.reduce<ContactItem[]>((list, item) => {
    if (!isPlainRecord(item)) {
      return list;
    }

    const name = toText(item.name).trim();
    const phone = toText(item.phone).trim();

    if (!name && !phone) {
      return list;
    }

    list.push({
      name,
      phone,
      expanded: true,
    });

    return list;
  }, []);
}

function toTimelineList(value: unknown): TimelineItem[] {
  const parsed: unknown = parseJsonIfString(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  const items: unknown[] = parsed;

  return items.reduce<TimelineItem[]>((list, item, index) => {
    if (!isPlainRecord(item)) {
      return list;
    }

    const label = toText(item.label).trim();
    const description = toText(item.description).trim();
    const startTime = normalizeDateTimeForApi(item.startTime ?? item.start_time);
    const endTime = normalizeDateTimeForApi(item.endTime ?? item.end_time);

    const sortOrderRaw = item.sortOrder ?? item.sort_order;
    const sortOrderNumber = Number(sortOrderRaw);
    const sortOrder = Number.isFinite(sortOrderNumber) ? sortOrderNumber : index;

    if (!label && !description && !startTime && !endTime) {
      return list;
    }

    list.push({
      label,
      description,
      startTime,
      endTime,
      sortOrder,
      expanded: true,
    });

    return list;
  }, []);
}

// function decodeChunk(buffer: ArrayBuffer): string {
//   const bytes = new Uint8Array(buffer);

//   try {
//     const encoded = Array.from(bytes)
//       .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
//       .join('');

//     return decodeURIComponent(encoded);
//   } catch {
//     return String.fromCharCode.apply(null, Array.from(bytes));
//   }
// }

Page({
  /** 字段任务队列，用于逐步执行字段填写 */
  fieldTaskQueue: Promise.resolve(),
  /** 活动content队列，用于存储待添加的content */
  contentQueue: [] as string[],
  /** 标记是否正在追加content */
  isAppendingContent: false,
  /** 标记是否已开始添加content */
  contentStarted: false,
  /** AI 思考定时器 */
  thinkingTimer: null as number | null,
  /** 标记是否已请求完成 */
  finishRequested: false,
  /** AI 流缓冲区 */
  streamBuffer: '',
  /**
   * 页面的初始数据
   */
  data: {
    categoryOptions: CATEGORY_OPTIONS,
    categoryIndex: 0,

    audienceOptions: AUDIENCE_OPTIONS_BASE,

    today: todayDate(),

    /** 用于给ai解析的文件 */
    aiFile: null as AiFile | null,

    form: {
      title: '',
      category: 0,
      organizer: '',
      audienceScope: 0,
      startTime: '',
      endTime: '',
      enrollDeadline: '',
      maxParticipants: '',
      location: '',
      joinMethod: '',
      contactInfo: [] as ContactItem[],
      timeline: [] as TimelineItem[],
      content: '',
      qrcodeUrl: '',
    },

    aiStatus: {
      phase: 'idle',
      text: '上传活动文件后，AI 可以自动识别并填写表单',
      activeField: '',
      activeLabel: '',
      activeSubText: '',
      skippedLabels: [] as string[],
    },

    userLockedFields: {},

    qrcodeImage: null as QrcodeImage | null,

    attachmentFiles: [] as ActivityAttachmentFile[],
    maxAttachmentCount: 9,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    /* empty */
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.stopThinkingTicker();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    /* empty */
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    /* empty */
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    /* empty */
  },

  /**
   * 滚动到指定选择器，使其顶部停在屏幕 ratio 位置（默认为 28%）
   * 这样可以让用户更好地看到正在填写的字段和 AI 的提示信息。
   *
   * @param selector 要滚动到的元素选择器，例如 '#field-title'
   * @param ratio 目标位置占屏幕高度的比例，默认为 0.28，表示“中心偏上”。可以根据需要调整，例如 0.38 更靠中间，0.18 更靠上。
   * @returns
   */
  scrollToSelectorCenter(selector: string, ratio = 0.28) {
    return new Promise<void>((resolve) => {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery();

        query.select(selector).boundingClientRect();
        query.selectViewport().scrollOffset();

        query.exec((res: unknown[] | null) => {
          const rect = res?.[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
          const viewport = res?.[1] as WechatMiniprogram.ScrollOffsetCallbackResult | null;

          if (!rect || !viewport) {
            resolve();
            return;
          }

          const windowHeight = wx.getWindowInfo().windowHeight;

          /**
           * ratio = 0.28 表示让目标元素顶部停在屏幕高度 28% 的位置
           * 也就是“中心偏上”
           *
           * 如果你想更靠中间：0.38
           * 如果你想更靠上：0.18
           */
          const targetScrollTop = viewport.scrollTop + rect.top - windowHeight * ratio;

          wx.pageScrollTo({
            scrollTop: Math.max(0, targetScrollTop),
            duration: 320,
            complete: () => {
              setTimeout(() => {
                resolve();
              }, 80);
            },
          });
        });
      });
    });
  },

  /**
   * 滚动到 AI 正在填写的字段所在位置
   * @param aiField AI 正在填写的字段名
   */
  async scrollToAiField(aiField: AiFieldKey) {
    const selector = AI_FIELD_SELECTOR_MAP[aiField];

    if (!selector) return;

    await this.scrollToSelectorCenter(selector, 0.28);
  },

  /**
   * 必要时滚动以跟随 content 字段的增长
   * 只有当 content 尾部超过屏幕 76% 时才滚动，目标是把尾部拉回到 68% 位置。
   * @returns 一个 Promise，在滚动完成后 resolve
   */
  async maybeFollowContentTail() {
    return new Promise<void>((resolve) => {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery();

        query.select('#content-tail-anchor').boundingClientRect();
        query.select('#page-root').boundingClientRect();
        query.selectViewport().scrollOffset();

        query.exec((res: unknown[] | null) => {
          const tailRect = res?.[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
          const pageRect = res?.[1] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
          const viewport = res?.[2] as WechatMiniprogram.ScrollOffsetCallbackResult | null;

          if (!tailRect || !pageRect || !viewport) {
            resolve();
            return;
          }

          const windowHeight = wx.getWindowInfo().windowHeight;

          /**
           * tailRect.top 是尾部锚点相对当前屏幕顶部的位置。
           * 只有尾部超过屏幕 76% 时，才需要跟随。
           */
          const followLine = windowHeight * 0.76;

          /**
           * 如果尾部已经在可视区舒适范围内，就不滚。
           * 这样可以避免 content 刚开始写入时反复抽搐。
           */
          if (tailRect.top <= followLine) {
            resolve();
            return;
          }

          /**
           * 计算整个页面高度，用于判断是否已经到底。
           */
          const pageHeight = viewport.scrollTop + pageRect.bottom;
          const maxScrollTop = Math.max(0, pageHeight - windowHeight);

          /**
           * 目标不是把尾部拉到中间，而是轻轻拉回 68% 位置。
           */
          const targetLine = windowHeight * 0.68;
          const targetScrollTop = viewport.scrollTop + tailRect.top - targetLine;
          const safeTarget = Math.min(Math.max(0, targetScrollTop), maxScrollTop);

          /**
           * 如果已经接近底部，或者目标滚动距离很小，就不滚。
           */
          const delta = Math.abs(safeTarget - viewport.scrollTop);

          if (delta < 24 || viewport.scrollTop >= maxScrollTop - 8) {
            resolve();
            return;
          }

          wx.pageScrollTo({
            scrollTop: safeTarget,
            duration: 120,
            complete: () => {
              resolve();
            },
          });
        });
      });
    });
  },

  isAiRunning() {
    const phase = this.data.aiStatus.phase;
    return phase === 'uploading' || phase === 'thinking' || phase === 'filling';
  },

  setAiStatus(partial: Partial<AiStatus>) {
    this.setData({
      aiStatus: {
        ...this.data.aiStatus,
        ...partial,
      },
    });
  },

  startThinkingTicker() {
    this.stopThinkingTicker();

    let index = 0;

    this.thinkingTimer = setInterval(() => {
      if (this.data.aiStatus.phase !== 'thinking') return;

      this.setData({
        'aiStatus.text': THINKING_TEXTS[index % THINKING_TEXTS.length],
      });

      index += 1;
    }, 1400);
  },

  stopThinkingTicker() {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  },

  hasValue(field: FormFieldKey, value: unknown): boolean {
    if (field === 'category') {
      return Number(value) !== 0;
    }

    if (field === 'audienceScope') {
      return Number(value) !== 0;
    }

    if (field === 'contactInfo') {
      return (
        Array.isArray(value) &&
        (value as ContactItem[]).some((item) => {
          return (item.name ? item.name : '').trim() || (item.phone ? item.phone : '').trim();
        })
      );
    }

    if (field === 'timeline') {
      return Array.isArray(value) && value.length > 0;
    }

    return String(value).trim() !== '';
  },

  snapshotUserFilledFields() {
    const form = this.data.form;
    const oldLocked = this.data.userLockedFields as Partial<Record<FormFieldKey, boolean>>;
    const nextLocked: Partial<Record<FormFieldKey, boolean>> = { ...oldLocked };

    const fields: FormFieldKey[] = [
      'title',
      'category',
      'organizer',
      'audienceScope',
      'startTime',
      'endTime',
      'enrollDeadline',
      'maxParticipants',
      'location',
      'joinMethod',
      'contactInfo',
      'timeline',
      'content',
      'qrcodeUrl',
    ];

    fields.forEach((field) => {
      if (this.hasValue(field, form[field])) {
        nextLocked[field] = true;
      }
    });

    this.setData({
      userLockedFields: nextLocked,
    });
  },

  markFieldByUser(field: FormFieldKey, value: unknown) {
    this.setData({
      [`userLockedFields.${field}`]: this.hasValue(field, value),
    });
  },

  isFieldLocked(field: FormFieldKey) {
    const lockedFields = this.data.userLockedFields as UserLockedFields;
    return Boolean(lockedFields[field]);
  },

  addSkippedField(aiField: AiFieldKey) {
    const label = FIELD_LABEL_MAP[aiField];
    const oldList = this.data.aiStatus.skippedLabels;

    if (oldList.includes(label)) return;

    this.setData({
      'aiStatus.skippedLabels': [...oldList, label],
    });
  },

  onTextInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as FormFieldKey;
    const value = e.detail.value;

    this.setData({
      [`form.${field}`]: value,
      [`userLockedFields.${field}`]: this.hasValue(field, value),
    });
  },

  onContentInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value;

    this.setData({
      'form.content': value,
      'userLockedFields.content': this.hasValue('content', value),
    });
  },

  onCategoryChange(e: WechatMiniprogram.PickerChange) {
    if (this.data.aiStatus.activeField === 'category') return;

    const index = Number(e.detail.value);
    const selected = CATEGORY_OPTIONS[index];

    this.setData({
      categoryIndex: index,
      'form.category': selected.value,
      'userLockedFields.category': true,
    });
  },

  onToggleAudience(e: WechatMiniprogram.TouchEvent) {
    if (this.data.aiStatus.activeField === 'audienceScope') {
      notifyToast({
        title: 'AI 正在填写参与范围',
        icon: 'none',
      });
      return;
    }

    const bit = Number(e.currentTarget.dataset.bit);
    let options = this.data.audienceOptions.map((item: AudienceOption) => ({ ...item }));

    if (bit === 0) {
      const fullOption = options.find((item: AudienceOption) => item.bit === 0);
      const nextFullSelected = !fullOption?.selected;

      options = options.map((item: AudienceOption) => ({
        ...item,
        selected: item.bit === 0 ? nextFullSelected : false,
      }));
    } else {
      options = options.map((item: AudienceOption) => {
        if (item.bit === 0) {
          return {
            ...item,
            selected: false,
          };
        }

        if (item.bit === bit) {
          return {
            ...item,
            selected: !item.selected,
          };
        }

        return item;
      });
    }

    const mask = buildAudienceMask(options);

    this.setData({
      audienceOptions: options,
      'form.audienceScope': mask,
      'userLockedFields.audienceScope': mask !== 0,
    });
  },

  onFormDateChange(e: WechatMiniprogram.PickerChange) {
    const field = e.currentTarget.dataset.field as FormFieldKey;
    const date = String(e.detail.value);
    const current = normalizeDateTime(this.data.form[field] as string);
    const next = combineDateTime(date, current.time);

    this.setData({
      [`form.${field}`]: next,
      [`userLockedFields.${field}`]: true,
    });
  },

  onFormTimeChange(e: WechatMiniprogram.PickerChange) {
    const field = e.currentTarget.dataset.field as FormFieldKey;
    const time = String(e.detail.value);
    const current = normalizeDateTime(this.data.form[field] as string);
    const next = combineDateTime(current.date, time);

    this.setData({
      [`form.${field}`]: next,
      [`userLockedFields.${field}`]: true,
    });
  },

  chooseAiFile() {
    if (this.isAiRunning()) {
      notifyToast({
        title: 'AI 处理中，请稍后',
        icon: 'none',
      });
      return;
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const tempFile = res.tempFiles[0];
        const name = tempFile.name || '';
        const ext = getExt(name);

        if (!isAllowedDocExt(ext)) {
          notifyToast({
            title: '仅支持 PDF、DOC、DOCX',
            icon: 'none',
          });
          return;
        }

        this.setData({
          aiFile: {
            name,
            path: tempFile.path,
            size: tempFile.size,
            sizeText: formatSize(tempFile.size),
            ext: ext as 'pdf' | 'doc' | 'docx',
          },
        });
      },
    });
  },

  removeAiFile() {
    if (this.isAiRunning()) {
      notifyToast({
        title: 'AI 处理中，暂不能删除',
        icon: 'none',
      });
      return;
    }

    this.setData({
      aiFile: null,
    });
  },

  previewAiFile() {
    const file = this.data.aiFile;
    if (!file) return;

    wx.openDocument({
      filePath: file.path,
      showMenu: true,
      fail: () => {
        notifyToast({
          title: '暂不支持预览该文件',
          icon: 'none',
        });
      },
    });
  },

  async startAiFill() {
    if (!this.data.aiFile) {
      notifyToast({
        title: '请先上传活动文件',
        icon: 'none',
      });
      return;
    }

    if (this.isAiRunning()) {
      notifyToast({
        title: 'AI 正在处理中',
        icon: 'none',
      });
      return;
    }

    this.snapshotUserFilledFields();

    this.finishRequested = false;
    this.fieldTaskQueue = Promise.resolve();
    this.streamBuffer = '';

    this.setData({
      'aiStatus.phase': 'uploading',
      'aiStatus.text': '正在上传活动文件...',
      'aiStatus.activeField': '',
      'aiStatus.activeLabel': '',
      'aiStatus.activeSubText': '',
      'aiStatus.skippedLabels': [],
    });

    try {
      const res = await activityAction.uploadActivityAiFile(this.data.aiFile.path);
      await this.startAiStream(res.taskId);
    } catch (e) {
      log.error('startAiFill', '上传文件失败', e);
      notifyToast({
        title: '文件上传失败，请稍后重试',
        icon: 'none',
      });
      this.setAiStatus({
        phase: 'error',
        text: '文件上传失败，请稍后重试',
        activeField: '',
        activeLabel: '',
        activeSubText: '',
      });
    }

    // wx.uploadFile({
    //   url: `${API_BASE}/v1/activity/ai-extract/upload`,
    //   filePath: this.data.aiFile.path,
    //   name: 'file',
    //   header: {
    //     Authorization: `Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJsb2dpblR5cGUiOiJsb2dpbiIsImxvZ2luSWQiOjEsInJuU3RyIjoiOEtZMHdwSmVVcWlWVGtHS2ZFVGxzNHRIbjBCdkpocWEifQ.xtQMSWjM3VaMLKHNRZ3D2lH20sk-Q0TdQug6vFkGFIA`,
    //   },

    //   success: (res) => {
    //     try {
    //       const data = JSON.parse(res.data);
    //       const taskId = data.data.taskId;

    //       if (!taskId) {
    //         throw new Error('missing taskId');
    //       }

    //       this.startAiStream(taskId);
    //     } catch {
    //       this.setAiStatus({
    //         phase: 'error',
    //         text: '文件已上传，但后端未返回有效 taskId',
    //         activeField: '',
    //         activeLabel: '',
    //         activeSubText: '',
    //       });
    //     }
    //   },
    //   fail: () => {
    //     this.setAiStatus({
    //       phase: 'error',
    //       text: '文件上传失败，请稍后重试',
    //       activeField: '',
    //       activeLabel: '',
    //       activeSubText: '',
    //     });
    //   },
    // });
  },

  async startAiStream(taskId: string) {
    this.setAiStatus({
      phase: 'thinking',
      text: 'AI 正在阅读活动文件...',
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });

    this.startThinkingTicker();

    const task = activityAction.startActivityPublishStream<AiStreamEvent | null>(
      taskId,
      undefined,
      (line) => {
        try {
          return JSON.parse(line) as AiStreamEvent;
        } catch {
          log.warn('startAiStream', '非法 JSON，已跳过:', line);
          return null;
        }
      },
    );

    try {
      for await (const event of task) {
        if (!event) continue;
        this.handleAiStreamEvent(event);
      }

      await task.done;

      this.finishAiWhenQueueEmpty();
    } catch (err) {
      log.error('startAiStream', 'AI 解析失败', err);
    }

    // const requestTask = wx.request({
    //   url: `${API_BASE}/v1/activity/ai-extract/stream?taskId=${taskId}`,
    //   header: {
    //     Accept: 'text/event-stream',
    //     Authorization: `Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJsb2dpblR5cGUiOiJsb2dpbiIsImxvZ2luSWQiOjEsInJuU3RyIjoiOEtZMHdwSmVVcWlWVGtHS2ZFVGxzNHRIbjBCdkpocWEifQ.xtQMSWjM3VaMLKHNRZ3D2lH20sk-Q0TdQug6vFkGFIA`,
    //   },
    //   enableChunked: true,
    //   success: () => {
    //     this.finishAiWhenQueueEmpty();
    //   },
    //   fail: () => {
    //     this.stopThinkingTicker();

    //     this.setAiStatus({
    //       phase: 'error',
    //       text: 'AI 解析失败，请稍后重试',
    //       activeField: '',
    //       activeLabel: '',
    //       activeSubText: '',
    //     });
    //   },
    // });

    // requestTask.onChunkReceived((chunk: { data: ArrayBuffer }) => {
    //   const text = decodeChunk(chunk.data);
    //   if (!text) return;

    //   this.consumeStreamText(text);
    // });
  },

  // consumeStreamText(text: string) {
  //   const merged = this.streamBuffer + text;
  //   const lines = merged.split('\n');
  //   const rest = lines.pop() ?? '';

  //   this.streamBuffer = rest;

  //   lines.forEach((line) => {
  //     const clean = line.replace(/^data:\s*/, '').trim();

  //     if (!clean || clean === '[DONE]') {
  //       if (clean === '[DONE]') {
  //         this.finishAiWhenQueueEmpty();
  //       }
  //       return;
  //     }

  //     try {
  //       const event = JSON.parse(clean);
  //       this.handleAiStreamEvent(event);
  //     } catch {
  //       // 半包或非 JSON 行，忽略。
  //     }
  //   });
  // },

  handleAiStreamEvent(event: AiStreamEvent | null) {
    if (!event) return;

    if (event.done || event.type === 'done') {
      this.finishAiWhenQueueEmpty();
      return;
    }

    if (event.type === 'thinking' || event.message || event.m) {
      this.setAiStatus({
        phase: 'thinking',
        text: event.message ?? event.m ?? 'AI 正在分析活动信息...',
        activeField: '',
        activeLabel: '',
        activeSubText: '',
      });
      return;
    }

    const aiField = normalizeAiFieldKey(event.f);

    if (aiField) {
      this.stopThinkingTicker();
      this.enqueueAiFieldEvent({
        f: aiField,
        v: event.v,
        append: event.append,
      });
      return;
    }

    if (event.f) {
      log.warn('handleAiStreamEvent', '未知 AI 字段，已跳过:', event.f);
    }
  },

  enqueueAiFieldEvent(event: { f: AiFieldKey; v: unknown; append?: boolean }) {
    this.fieldTaskQueue = this.fieldTaskQueue.then(() => {
      return this.applyAiFieldEvent(event);
    });
  },

  async applyAiFieldEvent(event: { f: AiFieldKey; v: unknown; append?: boolean }) {
    const aiField = event.f;
    const rawValue = parseJsonIfString(event.v);
    const append = event.append;

    const formField = AI_TO_FORM_FIELD_MAP[aiField];

    if (this.isFieldLocked(formField)) {
      this.addSkippedField(aiField);
      return;
    }

    this.setAiStatus({
      phase: 'filling',
      text: `AI 正在填写：${FIELD_LABEL_MAP[aiField]}`,
      activeField: aiField,
      activeLabel: FIELD_LABEL_MAP[aiField],
      activeSubText: '',
    });

    if (aiField === 'content') {
      if (!this.contentStarted) {
        this.contentStarted = true;
        await this.scrollToAiField(aiField);
        await sleep(120);
      }

      const contentValue = toText(rawValue);

      if (!contentValue.trim()) return;

      if (append) {
        await this.enqueueContent(contentValue);
      } else {
        this.setData({
          'form.content': contentValue,
        });
      }
      return;
    }

    await this.scrollToAiField(aiField);

    if (aiField === 'contactInfo') {
      await this.applyContactInfoSmoothly(toContactList(rawValue));
      return;
    }

    if (aiField === 'timelineItems') {
      await this.applyTimelineSmoothly(toTimelineList(rawValue));
      return;
    }

    if (aiField === 'category') {
      await this.applyCategoryByAi(toCategoryValue(rawValue));
      return;
    }

    if (aiField === 'audienceScope') {
      await this.applyAudienceByAi(toAudienceMask(rawValue));
      return;
    }

    const textValue = toText(rawValue);

    if (!textValue.trim()) {
      return;
    }

    const finalValue = isMainDateTimeField(formField)
      ? normalizeDateTimeForApi(textValue)
      : textValue;

    await this.typeFormFieldSmoothly(formField, finalValue);

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async applyCategoryByAi(value: number) {
    const index = CATEGORY_OPTIONS.findIndex((item) => item.value === value);
    const safeIndex = index >= 0 ? index : 0;
    const safeValue = CATEGORY_OPTIONS[safeIndex].value;

    await sleep(420);

    this.setData({
      categoryIndex: safeIndex,
      'form.category': safeValue,
    });

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async applyAudienceByAi(mask: number) {
    const safeMask = Number.isFinite(mask) ? mask : 0;
    const options = buildAudienceOptionsFromMask(safeMask);

    await sleep(420);

    this.setData({
      audienceOptions: options,
      'form.audienceScope': safeMask,
    });

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async typeFormFieldSmoothly(field: FormFieldKey, text: string) {
    const value = text || '';
    const steps = Math.max(4, Math.min(14, value.length || 4));
    const interval = Math.max(32, Math.floor(520 / steps));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        [`form.${field}`]: value.slice(0, end),
      });

      await sleep(interval);
    }
  },

  async enqueueContent(text: string) {
    if (!text.trim()) return;

    this.contentQueue.push(text);

    if (this.isAppendingContent) return;

    this.isAppendingContent = true;

    while (this.contentQueue.length) {
      const chunk = this.contentQueue.shift() ?? '';
      await this.appendContentSmoothly(chunk);
    }

    this.isAppendingContent = false;
  },

  async appendContentSmoothly(text: string) {
    const value = text || '';
    if (!value.trim()) return;

    this.setAiStatus({
      phase: 'filling',
      activeField: 'content',
      activeLabel: '活动详情',
      activeSubText: '正在追加活动详情内容',
      text: 'AI 正在填写：活动详情',
    });

    const oldText = this.data.form.content || '';
    const nextText = oldText + value;

    /**
     * content 第一次出现时，前面 applyAiFieldEvent 已经 scrollToAiField('content') 了。
     * 这里不要再主动滚到头，也不要马上滚到尾。
     */
    const steps = Math.max(6, Math.min(18, value.length || 6));
    const interval = Math.max(28, Math.floor(520 / steps));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        'form.content': oldText + value.slice(0, end),
      });

      /**
       * 前 2 步不滚。
       * 因为这时候 content 还没明显增长，滚动最容易抽搐。
       */
      if (i > 2 && (i % 4 === 0 || i === steps)) {
        await this.maybeFollowContentTail();
      }

      await sleep(interval);
    }

    this.setData({
      'form.content': nextText,
    });

    /**
     * 最后只做一次“必要时跟随”，不是强制滚动。
     */
    await this.maybeFollowContentTail();

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async applyContactInfoSmoothly(list: ContactItem[]) {
    if (!Array.isArray(list) || list.length === 0) return;

    this.setData({
      'form.contactInfo': [],
      'aiStatus.activeField': 'contactInfo',
      'aiStatus.activeLabel': '联系人',
      'aiStatus.activeSubText': '正在整理联系人信息',
    });

    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};

      const nextItem: ContactItem = {
        name: '',
        phone: '',
        expanded: true,
      };

      this.setData({
        'form.contactInfo': [...this.data.form.contactInfo, nextItem],
        'aiStatus.activeSubText': `正在填写联系人 ${String(i + 1)}`,
      });

      await this.scrollToSelectorCenter(`#contact-card-${String(i)}`, 0.34);

      await sleep(240);

      await this.typeContactField(i, 'name', item.name || '');
      await this.typeContactField(i, 'phone', item.phone || '');
    }

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async typeContactField(index: number, key: 'name' | 'phone', text: string) {
    const value = text || '';
    const steps = Math.max(3, Math.min(8, value.length || 3));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        [`form.contactInfo[${String(index)}].${key}`]: value.slice(0, end),
      });

      await sleep(45);
    }
  },

  async applyTimelineSmoothly(list: TimelineItem[]) {
    if (!Array.isArray(list) || list.length === 0) return;

    this.setData({
      'form.timeline': [],
      'aiStatus.activeField': 'timelineItems',
      'aiStatus.activeLabel': '活动时间线',
      'aiStatus.activeSubText': '正在生成活动时间线',
    });

    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};

      const nextItem: TimelineItem = {
        label: '',
        description: '',
        startTime: '',
        endTime: '',
        sortOrder: i,
        expanded: true,
      };

      this.setData({
        'form.timeline': [...this.data.form.timeline, nextItem],
        'aiStatus.activeSubText': `正在填写时间节点 ${String(i + 1)}`,
      });

      await this.scrollToSelectorCenter(`#timeline-card-${String(i)}`, 0.32);

      await sleep(240);

      await this.typeTimelineField(i, 'label', item.label || '');
      await this.typeTimelineField(i, 'description', item.description ?? '');

      this.setData({
        [`form.timeline[${String(i)}].startTime`]: item.startTime ?? '',
        [`form.timeline[${String(i)}].endTime`]: item.endTime ?? '',
        [`form.timeline[${String(i)}].sortOrder`]: item.sortOrder ? item.sortOrder : i,
      });

      await sleep(220);
    }

    this.setAiStatus({
      activeField: '',
      activeLabel: '',
      activeSubText: '',
    });
  },

  async typeTimelineField(index: number, key: 'label' | 'description', text: string) {
    const value = text || '';
    const steps = Math.max(3, Math.min(10, value.length || 3));

    for (let i = 1; i <= steps; i++) {
      const end = Math.ceil((value.length * i) / steps);

      this.setData({
        [`form.timeline[${String(index)}].${key}`]: value.slice(0, end),
      });

      await sleep(42);
    }
  },

  finishAiWhenQueueEmpty() {
    if (this.finishRequested) return;

    this.finishRequested = true;

    this.fieldTaskQueue = this.fieldTaskQueue.then(() => {
      this.stopThinkingTicker();

      const skipped = this.data.aiStatus.skippedLabels;

      this.setAiStatus({
        phase: 'done',
        text: skipped.length
          ? `AI 填写完成，已跳过你手动填写的字段：${skipped.join('、')}`
          : 'AI 填写完成，请检查后发布',
        activeField: '',
        activeLabel: '',
        activeSubText: '',
      });
    });
  },

  addContact() {
    const list = this.data.form.contactInfo;

    this.setData({
      'form.contactInfo': [
        ...list,
        {
          name: '',
          phone: '',
          expanded: true,
        },
      ],
      'userLockedFields.contactInfo': true,
    });
  },

  removeContact(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const list = this.data.form.contactInfo.filter((_: ContactItem, i: number) => i !== index);

    this.setData({
      'form.contactInfo': list,
      'userLockedFields.contactInfo': this.hasValue('contactInfo', list),
    });
  },

  toggleContactExpand(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.form.contactInfo[index];

    this.setData({
      [`form.contactInfo[${String(index)}].expanded`]: !item.expanded,
    });
  },

  onContactInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as 'name' | 'phone';
    const value = e.detail.value;

    this.setData({
      [`form.contactInfo[${String(index)}].${key}`]: value,
    });

    const nextList = this.data.form.contactInfo.map((item: ContactItem, i: number) => {
      if (i !== index) return item;
      return {
        ...item,
        [key]: value,
      };
    });

    this.setData({
      'userLockedFields.contactInfo': this.hasValue('contactInfo', nextList),
    });
  },

  addTimelineNode() {
    const list = this.data.form.timeline;

    this.setData({
      'form.timeline': [
        ...list,
        {
          label: '',
          description: '',
          startTime: '',
          endTime: '',
          sortOrder: list.length,
          expanded: true,
        },
      ],
      'userLockedFields.timeline': true,
    });
  },

  removeTimelineNode(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);

    const list = this.data.form.timeline
      .filter((_: TimelineItem, i: number) => i !== index)
      .map((item: TimelineItem, i: number) => ({
        ...item,
        sortOrder: i,
      }));

    this.setData({
      'form.timeline': list,
      'userLockedFields.timeline': list.length > 0,
    });
  },

  toggleTimelineExpand(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.form.timeline[index];

    this.setData({
      [`form.timeline[${String(index)}].expanded`]: !item.expanded,
    });
  },

  onTimelineInput(e: WechatMiniprogram.Input) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as keyof TimelineItem;
    const value = e.detail.value;

    this.setData({
      [`form.timeline[${String(index)}].${key}`]: value,
      'userLockedFields.timeline': true,
    });
  },

  onTimelineDateChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as 'startTime' | 'endTime';
    const date = String(e.detail.value);
    const current = normalizeDateTime(
      String(this.data.form.timeline[index][key as keyof TimelineItem] ?? ''),
    );
    const next = combineDateTime(date, current.time);

    this.setData({
      [`form.timeline[${String(index)}].${key}`]: next,
      'userLockedFields.timeline': true,
    });
  },

  onTimelineTimeChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.currentTarget.dataset.index);
    const key = e.currentTarget.dataset.key as 'startTime' | 'endTime';
    const time = String(e.detail.value);
    const current = normalizeDateTime(
      String(this.data.form.timeline[index][key as keyof TimelineItem] ?? ''),
    );
    const next = combineDateTime(current.date, time);

    this.setData({
      [`form.timeline[${String(index)}].${key}`]: next,
      'userLockedFields.timeline': true,
    });
  },

  chooseQrcodeImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];

        this.setData({
          qrcodeImage: {
            path: file.tempFilePath,
            previewUrl: file.tempFilePath,
            status: 'local',
          },
          'userLockedFields.qrcodeUrl': true,
        });

        // 后续在这里接你的 COS 上传：
        // 上传成功后：
        // this.setData({
        //   'qrcodeImage.url': cosUrl,
        //   'qrcodeImage.previewUrl': cosUrl,
        //   'qrcodeImage.status': 'uploaded',
        //   'form.qrcode_url': cosUrl,
        // });
      },
    });
  },

  async previewQrcode() {
    const img = this.data.qrcodeImage;
    if (!img?.previewUrl) return;

    await wx.previewImage({
      urls: [img.previewUrl],
      current: img.previewUrl,
    });
  },

  removeQrcode() {
    this.setData({
      qrcodeImage: null,
      'form.qrcodeUrl': '',
      'userLockedFields.qrcodeUrl': false,
    });
  },

  async chooseAttachmentFile() {
    const currentFiles = this.data.attachmentFiles;
    const maxCount = this.data.maxAttachmentCount || 9;
    const remainCount = maxCount - currentFiles.length;

    if (remainCount <= 0) {
      notifyToast({
        title: `最多上传 ${String(maxCount)} 个附件`,
        icon: 'none',
      });
      return;
    }

    let selected: SelectedMediaFile[];

    try {
      selected = await mediaAction.selectMessageFiles({
        count: remainCount,
        type: 'file',
        extension: ['pdf', 'doc', 'docx'],
      });
    } catch (e) {
      console.error('chooseAttachmentFile', '选择文件失败', e);
      notifyToast({
        title: '选择文件失败，请尝试重新选择',
        icon: 'none',
      });
      return;
    }

    const localFiles: ActivityAttachmentFile[] = selected.map((file) => {
      const name = file.originalName || '';
      const size = file.fileSize ?? 0;
      const ext = getExt(name);

      return {
        name,
        path: file.filePath,
        size,
        sizeText: formatSize(size),
        ext,
        status: 'uploading',
      };
    });

    const startIndex = currentFiles.length;

    this.setData({
      attachmentFiles: [...currentFiles, ...localFiles],
    });

    void this.uploadAttachmentFiles(selected, startIndex);
  },

  async uploadAttachmentFiles(selected: SelectedMediaFile[], startIndex: number) {
    let attachmentItems: AttachmentItemRequest[];

    try {
      attachmentItems = await mediaAction.uploadAndSaveFiles(TARGET_TYPES.ACTIVITY.value, selected);
    } catch (e) {
      console.error('uploadAttachmentFiles', '上传文件失败', e);

      const files = [...this.data.attachmentFiles];

      selected.forEach((_, offset) => {
        const index = startIndex + offset;
        if (files[index]) {
          files[index] = {
            ...files[index],
            status: 'failed',
            uploadError: '上传失败',
          };
        }
      });

      this.setData({
        attachmentFiles: files,
      });

      notifyToast({
        title: '部分附件上传失败',
        icon: 'none',
      });

      return;
    }

    const files = [...this.data.attachmentFiles];

    attachmentItems.forEach((item, offset) => {
      const index = startIndex + offset;
      const oldFile = files[index] ? files[index] : null;

      if (!oldFile) return;

      files[index] = {
        ...oldFile,
        ...item,
        status: 'uploaded',
        uploadError: '',
      };
    });

    this.setData({
      attachmentFiles: files,
    });
  },

  previewAttachment(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const file = this.data.attachmentFiles[index] ? this.data.attachmentFiles[index] : null;

    if (!file) return;

    if (file.path) {
      wx.openDocument({
        filePath: file.path,
        showMenu: true,
        fail: () => {
          notifyToast({
            title: '暂不支持预览该文件',
            icon: 'none',
          });
        },
      });
      return;
    }

    if (file.url) {
      wx.downloadFile({
        url: file.url,
        success: (res) => {
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fail: () => {
              notifyToast({
                title: '暂不支持预览该文件',
                icon: 'none',
              });
            },
          });
        },
        fail: () => {
          notifyToast({
            title: '文件下载失败',
            icon: 'none',
          });
        },
      });
      return;
    }

    notifyToast({
      title: '暂无可预览文件',
      icon: 'none',
    });
  },

  async replaceAttachment(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);

    if (!Number.isInteger(index) || index < 0) return;

    let selected: SelectedMediaFile[];

    try {
      selected = await mediaAction.selectMessageFiles({
        count: 1,
        type: 'file',
        extension: ['pdf', 'doc', 'docx'],
      });
    } catch (e) {
      console.error('replaceAttachment', '选择文件失败', e);
      notifyToast({
        title: '选择文件失败，请尝试重新选择',
        icon: 'none',
      });
      return;
    }

    let attachmentItems: AttachmentItemRequest[];

    try {
      attachmentItems = await mediaAction.uploadAndSaveFiles(TARGET_TYPES.ACTIVITY.value, selected);
    } catch (e) {
      console.error('replaceAttachment', '上传文件失败', e);
      notifyToast({
        title: '文件上传失败，请尝试重新选择上传',
        icon: 'none',
      });
      return;
    }

    const nextFile = attachmentItems[0] ? attachmentItems[0] : null;
    if (!nextFile) return;

    const files = [...this.data.attachmentFiles];
    files[index] = {
      name: nextFile.originalName,
      path: selected[0].filePath,
      ext: getExt(nextFile.originalName),
      size: selected[0].fileSize ?? 0,
      sizeText: formatSize(selected[0].fileSize ?? 0),
      url: nextFile.url,
      status: 'uploaded',
      uploadError: '',
    };

    this.setData({
      attachmentFiles: files,
    });
  },

  removeAttachment(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);

    if (!Number.isInteger(index) || index < 0) return;

    const files = [...this.data.attachmentFiles];
    files.splice(index, 1);

    this.setData({
      attachmentFiles: files,
    });
  },

  retryAttachmentUpload(e: WechatMiniprogram.TouchEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const file = this.data.attachmentFiles[index];

    if (!file.path) {
      notifyToast({
        title: '无法重试，请重新选择文件',
        icon: 'none',
      });
      return;
    }

    const files = [...this.data.attachmentFiles];

    files[index] = {
      ...file,
      status: 'uploading',
      uploadError: '',
    };

    this.setData({
      attachmentFiles: files,
    });

    const selectedFile = {
      originalName: file.name,
      filePath: file.path,
    };

    void this.uploadAttachmentFiles([selectedFile], index);
  },

  validateAttachmentBeforeSubmit() {
    const files = this.data.attachmentFiles;

    const hasUploading = files.some((item) => item.status === 'uploading');

    if (hasUploading) {
      notifyToast({
        title: '附件上传中，请稍后提交',
        icon: 'none',
      });
      return false;
    }

    const hasFailed = files.some((item) => item.status === 'failed');

    if (hasFailed) {
      notifyToast({
        title: '存在上传失败的附件，请删除或重试',
        icon: 'none',
      });
      return false;
    }

    return true;
  },

  buildSubmitPayload(): ActivityCreateRequest {
    const form = this.data.form;

    const contactInfo = form.contactInfo.map((item: ContactItem) => ({
      name: item.name.trim(),
      phone: item.phone.trim(),
    }));

    const timelineItems: TimelineItemRequest[] = form.timeline
      .map((item: TimelineItem) => ({
        label: item.label.trim(),
        description: (item.description ?? '').trim(),
        startTime: normalizeDateTimeForApi(item.startTime),
        endTime: normalizeDateTimeForApi(item.endTime),
        sortOrder: item.sortOrder,
      }))
      .filter((item) => item.label);

    const attachmentItems: AttachmentItemRequest[] = this.data.attachmentFiles
      .filter((item) => item.status === 'uploaded')
      .map((item, index) => ({
        type: resolveAttachmentMediaType(item.ext),
        originalName: item.name,
        url: item.url ?? '',
        sortOrder: index,
      }));

    return {
      title: form.title.trim(),
      category: form.category,
      organizer: form.organizer.trim(),
      audienceScope: form.audienceScope,
      startTime: normalizeDateTimeForApi(form.startTime),
      endTime: normalizeDateTimeForApi(form.endTime),
      enrollDeadline: normalizeDateTimeForApi(form.enrollDeadline),
      maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : 0,
      location: form.location.trim(),
      joinMethod: form.joinMethod.trim(),
      contactInfo: JSON.stringify(contactInfo),
      content: form.content.trim(),
      qrcodeUrl: (form.qrcodeUrl || this.data.qrcodeImage?.url) ?? '',
      timelineItems,
      attachmentItems,
    };
  },

  submitActivity() {
    if (!this.validateAttachmentBeforeSubmit()) return;

    const payload = this.buildSubmitPayload();

    if (!payload.title) {
      notifyToast({
        title: '请填写活动标题',
        icon: 'none',
      });
      return;
    }

    if (!payload.content) {
      notifyToast({
        title: '请填写活动详情',
        icon: 'none',
      });
      return;
    }

    if (!payload.startTime || !payload.endTime) {
      notifyToast({
        title: '请选择活动开始和结束时间',
        icon: 'none',
      });
      return;
    }

    activityAction
      .createActivity(payload)
      .then(() => {
        notifyToast({
          title: '发布成功',
          icon: 'success',
        });
      })
      .catch(() => {
        notifyToast({
          title: '发布失败',
          icon: 'none',
        });
      });
  },
});
