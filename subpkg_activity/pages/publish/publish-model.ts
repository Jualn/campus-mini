import type { ActivityCreateRequest } from '../../../types/api';
import { MEDIA_TYPES, type MediaType } from '../../../utils/constants';

export type UserLockedFields = Partial<Record<FormFieldKey, boolean>>;

export type AiFieldKey =
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

export type FormFieldKey =
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

export type AiPhase = 'idle' | 'uploading' | 'thinking' | 'filling' | 'done' | 'error';

export interface CategoryOption {
  label: string;
  value: number;
}

export interface AudienceOption {
  label: string;
  bit: number;
  selected: boolean;
}

export interface AiFile {
  name: string;
  path: string;
  size: number;
  sizeText: string;
  ext: 'pdf' | 'doc' | 'docx';
}

export interface ContactItem {
  name: string;
  phone: string;
  expanded?: boolean;
}

export interface TimelineItem {
  label: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  sortOrder: number;
  expanded?: boolean;
}

export interface QrcodeImage {
  objectKey?: string;
  path: string;
  previewUrl: string;
  url?: string;
  status: 'local' | 'uploading' | 'uploaded' | 'error';
}

export type UploadStatus = 'local' | 'uploading' | 'uploaded' | 'failed';
export interface ActivityAttachmentFile {
  name: string;
  path: string;
  objectKey?: string;
  url?: string;
  size: number;
  sizeText: string;
  ext: string;
  status: UploadStatus;
  uploadError?: string;
}

export function resolveAttachmentMediaType(ext: string): MediaType {
  const normalized = ext.toLowerCase();
  if (normalized === 'pdf') return MEDIA_TYPES.PDF.value;
  if (normalized === 'doc' || normalized === 'docx') return MEDIA_TYPES.WORD.value;
  return MEDIA_TYPES.IMAGE.value;
}

/* ActivityForm 接口已移除，页面直接使用内联类型 */

export interface AiStatus {
  phase: AiPhase;
  text: string;
  activeField: AiFieldKey | '';
  activeLabel: string;
  activeSubText: string;
  skippedLabels: string[];
}

export interface AiStreamEvent {
  /** 后端可能返回 camelCase，也可能返回 snake_case，所以这里先放宽为 string，进入处理前再归一化 */
  f?: AiFieldKey;
  v?: unknown;
  type?: string;
  message?: string;
  m?: string;
  done?: boolean;
  append?: boolean;
}

export const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: '其他', value: 0 },
  { label: '文体比赛', value: 1 },
  { label: '志愿公益', value: 2 },
  { label: '思政主题', value: 3 },
  { label: '学术讲座', value: 4 },
  { label: '体育运动', value: 5 },
];

export const AUDIENCE_OPTIONS_BASE: AudienceOption[] = [
  { label: '全院', bit: 0, selected: false },
  { label: '信息', bit: 1, selected: false },
  { label: '理工', bit: 2, selected: false },
  { label: '财经', bit: 3, selected: false },
  { label: '人文', bit: 4, selected: false },
  { label: '基础', bit: 5, selected: false },
];

export const FIELD_LABEL_MAP: Record<AiFieldKey, string> = {
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

export const AI_TO_FORM_FIELD_MAP: Record<AiFieldKey, FormFieldKey> = {
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

export const THINKING_TEXTS = [
  'AI 正在阅读活动文件...',
  'AI 正在识别活动标题和分类...',
  'AI 正在提取时间、地点和参与方式...',
  'AI 正在整理联系人与活动时间线...',
  'AI 正在准备填写表单...',
];

// 滚动到表单字段的选择器
export const AI_FIELD_SELECTOR_MAP: Record<AiFieldKey, string> = {
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatSize(size: number) {
  if (!size) return '0 KB';

  if (size < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(size / 1024)))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getExt(name: string) {
  return (name || '').split('.').pop()?.toLowerCase() ?? '';
}

export function isAllowedDocExt(ext: string) {
  return ['pdf', 'doc', 'docx'].includes(ext);
}

export function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

export function normalizeDateTime(value: string) {
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

export function combineDateTime(date: string, time: string) {
  return `${date} ${time}:00`;
}

export function pad2(value: string) {
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
export function normalizeDateTimeForApi(value: unknown) {
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

export function isMainDateTimeField(field: FormFieldKey) {
  return field === 'startTime' || field === 'endTime' || field === 'enrollDeadline';
}

export function buildAudienceMask(options: AudienceOption[]) {
  return options.reduce((mask, item) => {
    if (!item.selected) return mask;
    return mask | (1 << item.bit);
  }, 0);
}

export function buildAudienceOptionsFromMask(mask: number) {
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

export const AI_FIELD_ALIAS_MAP: Record<string, AiFieldKey> = {
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

export function normalizeAiFieldKey(field: unknown): AiFieldKey | null {
  if (typeof field !== 'string') return null;
  return AI_FIELD_ALIAS_MAP[field] ?? null;
}

export function parseJsonIfString(value: unknown): unknown {
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

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function toCategoryValue(value: unknown): number {
  const parsed = parseJsonIfString(value);

  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;

  const text = toText(parsed).trim();
  if (!text) return 0;

  const num = Number(text);
  if (Number.isFinite(num)) return num;

  const option = CATEGORY_OPTIONS.find((item) => item.label === text);
  return option?.value ?? 0;
}

export function toAudienceMask(value: unknown): number {
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

export function toContactList(value: unknown): ContactItem[] {
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

export function toTimelineList(value: unknown): TimelineItem[] {
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
    const startTime = toText(item.startTime ?? item.start_time).trim();
    const endTime = toText(item.endTime ?? item.end_time).trim();

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

export const ACTION_OPTIONS = [
  { label: '网页', value: 1 },
  { label: 'QQ群', value: 2 },
  { label: '邮箱', value: 3 },
  { label: '微信号', value: 4 },
  { label: '线下办理', value: 7 },
  { label: '说明', value: 8 },
];

/** 日期保持日期精度，不从缺失信息推断时分。 */
export function toEventTime(value: string | undefined) {
  const text = (value ?? '').trim();
  return {
    value: text ? normalizeDateTimeForApi(text) : null,
    precision: !text ? 0 : /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text) ? 1 : 2,
  };
}

export function validatePublishInformation(payload: ActivityCreateRequest): string {
  if (!payload.title || payload.title.length > 128) return '请填写128字以内的活动标题';
  if (!payload.sections?.length || payload.sections.length > 30)
    return '请填写活动介绍，正文最多30节';
  if (
    payload.sections.some(
      (s) => !s.title || s.title.length > 128 || !s.content || s.content.length > 20000,
    )
  )
    return '每节需要标题和正文，请检查空白或过长内容';
  if (payload.content.length > 10000) return '活动介绍不能超过10000字';
  if (
    payload.maxParticipants !== null &&
    (!Number.isInteger(payload.maxParticipants) ||
      payload.maxParticipants <= 0 ||
      payload.maxParticipants > 2147483647)
  )
    return '官方人数请填写有效正整数，未知可留空';
  if (payload.contactInfo.length > 512) return '联系人信息过长，请精简';
  if (
    payload.organizer.length > 128 ||
    payload.location.length > 255 ||
    payload.joinMethod.length > 255
  )
    return '主办单位、地点或参与说明过长';
  const ranges = [
    { startTime: payload.startTime, endTime: payload.endTime, endPrecision: payload.endPrecision },
    ...payload.timelineItems,
  ];
  if (
    ranges.some(
      (r) =>
        r.startTime &&
        r.endTime &&
        r.startTime > (r.endPrecision === 1 ? r.endTime.slice(0, 10) + ' 23:59:59' : r.endTime),
    )
  )
    return '结束时间不能早于开始时间';
  if (
    payload.timelineItems.length > 20 ||
    payload.timelineItems.some((t) => !t.label || t.label.length > 64 || t.description.length > 255)
  )
    return '时间节点最多20个，请检查名称和说明';
  if ((payload.actions?.length ?? 0) > 20) return '参与入口最多20项';
  for (const a of payload.actions ?? []) {
    if (
      !a.label ||
      a.label.length > 128 ||
      a.description.length > 2000 ||
      a.targetValue.length > 1024
    )
      return '请检查入口名称及内容长度';
    if (a.actionType <= 4 && !a.targetValue) return '请填写入口地址或号码';
    if (a.actionType === 1 && !/^https:\/\/[^/\s@?#]+(?:[/?#][^\s]*)?$/i.test(a.targetValue))
      return '网页入口需要有效的 HTTPS 地址';
    if (a.actionType === 2 && !/^\d{5,20}$/.test(a.targetValue)) return 'QQ群号应为5至20位数字';
    if (a.actionType === 3 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.targetValue))
      return '请填写有效邮箱';
    if (a.actionType === 7 && !a.targetValue && !a.description) return '线下办理需要地址或说明';
    if (a.actionType === 8 && !a.description) return '请填写入口说明';
  }
  return '';
}
