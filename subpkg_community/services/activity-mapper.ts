// 分包本地副本；修改时同步其他分包同名文件，audit:packages 会校验一致性。
import type { ActivityUiStatus } from '../../types/activity';
import type { ActivityCard } from '../../types/business';
import type { ActivityListBO } from '../../types/api';
import {
  ACTIVITY_CATEGORYS,
  ACTIVITY_STATUS,
  type ActivityStatus,
  formatDepartmentText,
} from '../../utils/constants';
import { formatTime, calcDaysToDeadline, TimeStyle } from '../../utils/time-util';

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
