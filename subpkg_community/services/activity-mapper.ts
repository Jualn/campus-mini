// 分包本地副本；修改时同步其他分包同名文件，audit:packages 会校验一致性。
import type { ActivityUiStatus } from '../../types/activity';
import type { ActivityCard } from '../../types/business';
import type { ActivityListBO, EventInformationFields } from '../../types/api';
import {
  ACTIVITY_CATEGORYS,
  ACTIVITY_STATUS,
  type ActivityStatus,
  formatDepartmentText,
} from '../../utils/constants';
import { formatTime, parseDate, TimeStyle } from '../../utils/time-util';

export const STATUS_LABEL = {
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

export const TYPE_MAP: Record<string, Type> = {
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

export function injectIscancelled(status: ActivityStatus): ActivityUiStatus {
  if (status === ACTIVITY_STATUS.ONGOING.value) return 'ongoing';
  if (status === ACTIVITY_STATUS.SIGNUP.value) return 'enrolling';
  if (status === ACTIVITY_STATUS.DRAFT.value) return 'not_started';
  if (status === ACTIVITY_STATUS.ENDED.value) return 'ended';
  if (status === ACTIVITY_STATUS.CANCELED.value) return 'cancelled';
  return 'not_started';
}

type EventStatus = EventInformationFields & { status: ActivityStatus };

export function eventUiStatus(raw: EventStatus): ActivityUiStatus {
  if (raw.activityPhase === 'CANCELLED') return 'cancelled';
  if (raw.activityPhase === 'ENDED') return 'ended';
  if (raw.activityPhase === 'UNPUBLISHED' || raw.activityPhase === 'REMOVED') return 'not_started';
  if (raw.registrationStatus === 'OPEN') return 'enrolling';
  if (raw.activityPhase === 'ONGOING') return 'ongoing';
  if (raw.activityPhase || raw.registrationStatus) return 'not_started';
  return injectIscancelled(raw.status);
}

export function eventStatusLabel(raw: EventStatus): string {
  const phaseLabels: Record<string, string> = {
    CANCELLED: '已取消',
    ENDED: '已结束',
    UNPUBLISHED: '未发布',
    REMOVED: '已下架',
    UPCOMING: '待开始',
    ONGOING: '进行中',
    UNKNOWN: '时间待定',
  };
  if (['CANCELLED', 'ENDED', 'UNPUBLISHED', 'REMOVED'].includes(raw.activityPhase ?? ''))
    return phaseLabels[raw.activityPhase ?? ''];
  if (raw.registrationStatus === 'OPEN') return '报名中';
  if (raw.activityPhase) return phaseLabels[raw.activityPhase] || '时间待定';
  if (raw.registrationStatus) return '状态待确认';
  return STATUS_LABEL[injectIscancelled(raw.status)];
}

export function eventCapacity(raw: EventInformationFields & { maxParticipants: number | null }) {
  const capacity = raw.capacity !== undefined ? raw.capacity : raw.maxParticipants;
  const unit = raw.capacity !== undefined ? raw.capacityUnit : 1;
  return {
    text:
      capacity == null
        ? '未提供'
        : `${String(capacity)} ${unit === 2 ? '队' : unit === 1 ? '人' : '（单位未提供）'}`,
    people: unit === 1 ? capacity : null,
  };
}

export function eventDeadline(raw: EventInformationFields & { enrollDeadline: string }) {
  const value = raw.registrationEnd !== undefined ? raw.registrationEnd : raw.enrollDeadline;
  const known = raw.registrationEndPrecision !== 0 && !!value;
  const date = known
    ? parseDate(
        raw.registrationEndPrecision === 1 ? value.slice(0, 10) + ' 23:59:59' : value,
      ).getTime()
    : NaN;
  const remaining = date - Date.now();
  const closed = raw.registrationStatus === 'CLOSED' || remaining < 0;
  const inactive = ['CANCELLED', 'ENDED', 'REMOVED', 'UNPUBLISHED'].includes(
    raw.activityPhase ?? '',
  );
  const days =
    raw.registrationMode !== 1 &&
    Number.isFinite(date) &&
    !closed &&
    !inactive &&
    (raw.registrationStatus === undefined || raw.registrationStatus === 'OPEN')
      ? Math.ceil(remaining / 86400000)
      : null;
  return {
    days,
    text: known
      ? formatTime(
          value,
          raw.registrationEndPrecision === 1 ? TimeStyle.DATE : TimeStyle.SHORT_YMDHM,
        )
      : '待确认',
    summary:
      raw.registrationMode === 1 || raw.registrationStatus === 'NOT_REQUIRED'
        ? '无需报名'
        : closed
          ? '已截止'
          : days !== null
            ? `${String(days)}天`
            : known
              ? '见时间安排'
              : '待确认',
  };
}

export function toCard(raw: ActivityListBO): ActivityCard {
  const categories: Partial<Record<string, { text: string }>> = ACTIVITY_CATEGORYS;
  const category = categories[raw.category] ?? ACTIVITY_CATEGORYS.OTHER;
  const deadline = eventDeadline(raw);
  const capacity = eventCapacity(raw);
  const typeInfo = TYPE_MAP[category.text] ?? {
    color: 'default',
    icon: '',
  };

  return {
    id: raw.id,
    title: raw.title,
    cover: undefined,
    type: category.text,
    typeIcon: typeInfo.icon,
    typeColor: typeInfo.color,
    location: raw.location,
    max_participants: capacity.people,
    capacityText: capacity.text,
    deadlineText:
      deadline.summary === '无需报名' || deadline.summary === '已截止'
        ? deadline.summary
        : `报名截止 ${deadline.text}`,
    enroll_deadline: deadline.text,
    scope: formatDepartmentText(raw.audienceScope),
    organizer: raw.organizer,
    // summary: raw.summary,
    // series_name: raw.series_name,
    status: eventUiStatus(raw),
    statusLabel: eventStatusLabel(raw),
    daysToDeadline: deadline.days,
    published_at: raw.publishedAt ? formatTime(raw.publishedAt, TimeStyle.FULL) : '',
    // startDateShort: formatShortDate(raw.start_time),
  };
}
