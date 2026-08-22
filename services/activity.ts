// activity.ts
/**
 * 活动服务 (Activity Service)
 *
 * 对齐 OpenAPI：
 * - GET    /v1/activity
 * - POST   /v1/activity
 * - GET    /v1/activity/{id}
 * - PUT    /v1/activity/{id}
 * - DELETE /v1/activity/{id}
 */

import { api } from './api';
import { createLogger } from '../utils/logger';
import type { ActivityCard, ActivityDetail, ServiceCursorPage } from '../types/business';
import type {
  ActivityCreateRequest,
  ActivityDetailVO,
  ActivityListBO,
  ActivityUploadBO,
} from '../types/api';
import {
  ACTIVITY_CATEGORYS,
  ACTIVITY_STATUS,
  type ActivityStatus,
  formatDepartmentText,
} from '../utils/constants';
import { formatTime, calcDaysToDeadline, parseDate, TimeStyle } from '../utils/time-util';

const log = createLogger('ActivityService');
void log;
// ============================================================
// § 1  页面就绪类型（页面层唯一依赖的类型，与后端结构完全解耦）
// ============================================================

// ── 1-1  状态枚举 ────────────────────────────────────────────

export type ActivityUiStatus =
  | 'not_started' // 未开始（报名未开放）
  | 'enrolling' // 报名中
  | 'ongoing' // 进行中（报名已截止，活动进行中）
  | 'ended' // 已结束
  | 'cancelled'; // 已取消

const STATUS_LABEL = {
  enrolling: '报名中',
  not_started: '待开始',
  ongoing: '进行中',
  ended: '已结束',
  cancelled: '已取消',
};

interface Type {
  color: string;
  icon: string;
}

const TYPE_MAP: Record<string, Type> = {
  志愿公益: {
    color: 'volunteer',
    icon: '',
  },
  体育运动: {
    color: 'competition',
    icon: '',
  },
  学术讲座: {
    color: 'lecture',
    icon: '',
  },
  文体比赛: {
    color: 'campus',
    icon: '',
  },
  其他: {
    color: 'campus',
    icon: '',
  },
};

// ── 1-2  时间轴（注入状态后的版本）────────────────────────────

export type TimelineNodeStatus = 'done' | 'active' | 'pending';

export interface TimelineNode {
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  // source: string;
  note: string;
  status: TimelineNodeStatus;
}

// ── 1-3  参与方式（判别联合，按 type 收窄）────────────────────

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

// ── 1-4  其他子类型 ───────────────────────────────────────────

export interface Reward {
  level: string;
  count: number | null;
  prize: string;
  note: string;
}

export interface Contact {
  name: string;
  role?: string;
  phone?: string;
  qq?: string;
  email?: string;
  note?: string;
}

export interface Attachment {
  type: string;
  name: string;
  url: string;
  note?: string;
}

// ============================================================
// § 2  内部计算函数（private，不 export，只供本文件使用）
// ============================================================

function getExtension(name: string): string {
  const index = name.lastIndexOf('.');

  if (index === -1 || index === 0 || index === name.length - 1) {
    return '';
  }

  return name.substring(index + 1);
}

function injectTimelineStatus(items: ActivityDetailVO['timelineItems']): TimelineNode[] {
  const now = Date.now();
  let activePicked = false;

  return items
    .slice()
    .sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return parseDate(a.startTime).getTime() - parseDate(b.startTime).getTime();
    })
    .map((item) => {
      const ts = item.startTime ? parseDate(item.startTime).getTime() : NaN;
      let status: TimelineNodeStatus;

      if (!isNaN(ts) && now > ts) {
        status = 'done';
      } else if (!activePicked) {
        status = 'active';
        activePicked = true;
      } else {
        status = 'pending';
      }

      return {
        label: item.label,
        date: item.startTime ? formatTime(item.startTime, TimeStyle.DATE) : '',
        time: item.startTime ? formatTime(item.startTime, TimeStyle.TIME) : '',
        note: item.description,
        status,
      };
    });
}

function injectIscancelled(status: ActivityStatus): ActivityUiStatus {
  if (status === ACTIVITY_STATUS.ONGOING.value) return 'ongoing';
  if (status === ACTIVITY_STATUS.SIGNUP.value) return 'enrolling';
  if (status === ACTIVITY_STATUS.DRAFT.value) return 'not_started';
  if (status === ACTIVITY_STATUS.ENDED.value) return 'ended';
  if (status === ACTIVITY_STATUS.CANCELED.value) return 'cancelled';
  return 'not_started';
}

function normalizeAttachments(raw: ActivityDetailVO['attachmentItems']): Attachment[] {
  return raw.map((a) => ({
    type: getExtension(a.originalName),
    name: a.originalName,
    url: a.url,
    note: undefined,
  }));
}

function normalizeContacts(raw: ActivityDetailVO['contactInfo']): Contact[] {
  // contactInfo 是一个 JSON 字符串，包含联系人数组
  if (!raw) return [];
  const contacts = JSON.parse(raw) as Contact[];
  if (Array.isArray(contacts)) {
    return contacts.map((c) => ({
      name: c.name,
      role: undefined,
      phone: c.phone ?? undefined,
      qq: c.qq ?? undefined,
      email: c.email ?? undefined,
      note: c.note ?? undefined,
    }));
  }
  return [];
}

/** ActivityCard（列表页用） */
export function toCard(raw: ActivityListBO): ActivityCard {
  const typeInfo = TYPE_MAP[ACTIVITY_CATEGORYS[raw.category].text] ?? {
    color: 'default',
    icon: '',
  };

  return {
    id: raw.id,
    title: raw.title,
    cover: undefined,
    type: ACTIVITY_CATEGORYS[raw.category].text,
    typeIcon: typeInfo.icon,
    typeColor: typeInfo.color,
    location: raw.location,
    max_participants: raw.maxParticipants ?? null,
    enroll_deadline: formatTime(raw.enrollDeadline, TimeStyle.SHORT_YMDHM),
    scope: formatDepartmentText(raw.audienceScope),
    organizer: raw.organizer,
    // summary: raw.summary,
    // series_name: raw.series_name,
    status: injectIscancelled(raw.status),
    statusLabel: STATUS_LABEL[injectIscancelled(raw.status)],
    daysToDeadline: calcDaysToDeadline(raw.enrollDeadline),
    published_at: formatTime(raw.publishedAt, TimeStyle.FULL),
    // startDateShort: formatShortDate(raw.start_time),
  };
}

/** ActivityRaw → ActivityDetail（详情页用） */
function toDetail(raw: ActivityDetailVO): ActivityDetail {
  const typeInfo = TYPE_MAP[ACTIVITY_CATEGORYS[raw.category].text] ?? {
    color: 'default',
    icon: '',
  };

  return {
    id: raw.id,
    title: raw.title,
    cover: undefined,
    scope: formatDepartmentText(raw.audienceScope),
    organizer: raw.organizer,
    type: ACTIVITY_CATEGORYS[raw.category].text,
    typeIcon: typeInfo.icon,
    typeColor: typeInfo.color,
    statusLabel: STATUS_LABEL[injectIscancelled(raw.status)],
    daysToDeadline: calcDaysToDeadline(raw.enrollDeadline),
    startDateShort: formatTime(raw.startTime, TimeStyle.DATE),
    status: injectIscancelled(raw.status),
    description: raw.content.replace(/\\n/g, '\n'),
    location: raw.location,
    max_participants: raw.maxParticipants,
    enroll_deadline: formatTime(raw.enrollDeadline, TimeStyle.SHORT_YMDHM),
    start_time: formatTime(raw.startTime, TimeStyle.FULL),
    end_time: formatTime(raw.endTime, TimeStyle.FULL),
    // series_id: raw.series_id,
    // source: raw.source,
    published_at: formatTime(raw.publishedAt, TimeStyle.FULL),
    is_cancelled: injectIscancelled(raw.status) === 'cancelled',
    timeline: injectTimelineStatus(raw.timelineItems),
    // rewards: raw.rewards,
    contacts: normalizeContacts(raw.contactInfo),
    attachments: normalizeAttachments(raw.attachmentItems),
    join_method: raw.joinMethod,
    qrcode_url: raw.qrcodeUrl,
  };
}

/**
 * 创建活动
 *
 * POST /v1/activity
 * @param payload - 活动创建请求体，详见 ActivityCreateRequest
 * @returns 新创建的活动ID
 */
export const create = async (payload: ActivityCreateRequest): Promise<string> => {
  return api.activity.create(payload);
};

/**
 * 获取活动列表
 *
 * GET /v1/activity
 * 请求参数: ActivityPageQuery
 * {
 *   lastId?: number,
 *   pageSize?: number,
 *   category?: number,
 *   status?: number,
 *   keyword?: string
 * }
 *
 * 响应体: ResultPageResultActivityListVO
 *
 * @example
 * getActivityList({ page: 1, pageSize: 20, status: 'ongoing' })
 */
export const getActivityList = async (
  options: {
    lastId?: string;
    pageSize?: number;
    category?: number;
    status?: number;
    keyword?: string;
  } = {},
): Promise<ServiceCursorPage<ActivityCard>> => {
  const { lastId, pageSize = 20, category, status, keyword } = options;

  const page = await api.activity.fetchActivityList({
    lastId,
    pageSize,
    category,
    status,
    keyword,
  });
  return {
    list: page.list.map(toCard),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
};

/**
 * 获取活动详情
 *
 * GET /v1/activity/{id}
 * 响应体: ResultActivityDetailVO
 * @param {string} activityId - 活动ID
 * @returns {Promise}
 *
 * @example
 * getActivityDetail('1')
 */
export const getActivityDetail = async (activityId: string): Promise<ActivityDetail> => {
  if (!activityId) {
    return Promise.reject(new Error('activityId不能为空'));
  }

  const detail = await api.activity.fetchActivityDetail(activityId);
  return toDetail(detail);
};

/**
 * 上传提交表单用于ai解析的活动文件
 *
 * @param filePath 文件临时路径
 * @returns Promise<ActivityUploadBO>
 */
export const upload = async (filePath: string): Promise<ActivityUploadBO> => {
  if (!filePath) {
    return Promise.reject(new Error('filePath不能为空'));
  }

  return api.activity.upload(filePath);
};

/**
 * 获取活动发布流
 *
 * @param taskId upload中返回的taskId
 * @param skipped 需要跳过的字段json格式的string
 * @param parser 每行数据的解析函数,line就表示传输过程中data:xx的xx信息,返回 T 类型或 null（表示该行数据被过滤掉）
 * @returns
 */
export const activtyPublishStream = <T>(
  taskId: string,
  skipped?: string,
  parser?: (line: string) => T,
) => api.activity.activtyPublishStream<T>(taskId, skipped, parser);
