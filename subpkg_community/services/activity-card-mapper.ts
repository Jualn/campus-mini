// 分包本地副本；audit:packages 校验消费者一致性。
import type { ActivitySummaryDTO } from '../../types/event-contract';
import type { ActivityCard } from '../../types/business';
import type { ActivityUiStatus } from '../../types/activity';
import { activityScopeLabels } from '../../utils/activity-audience';
import { exactCountdownDays, formatTimelineSchedule } from '../utils/event-timeline';

const CATEGORY_LABELS: Record<ActivitySummaryDTO['category'], string> = {
  LECTURE: '学术讲座',
  COMPETITION: '比赛',
  SPORTS: '体育运动',
  VOLUNTEERING: '志愿公益',
  THEMED: '主题活动',
  OTHER: '其他',
};

const TYPE_COLORS: Record<ActivitySummaryDTO['category'], string> = {
  LECTURE: 'lecture',
  COMPETITION: 'campus',
  SPORTS: 'competition',
  VOLUNTEERING: 'volunteer',
  THEMED: 'campus',
  OTHER: 'campus',
};

function uiStatus(raw: ActivitySummaryDTO): ActivityUiStatus {
  if (raw.lifecycleStatus === 'CANCELLED') return 'cancelled';
  if (raw.lifecycleStatus === 'ENDED') return 'ended';
  if (raw.availability.state === 'OPEN') return 'enrolling';
  if (raw.availability.state === 'NOT_OPEN') return 'not_started';
  return 'ongoing';
}

function statusLabel(raw: ActivitySummaryDTO): string {
  if (raw.lifecycleStatus === 'CANCELLED') return '已取消';
  if (raw.lifecycleStatus === 'ENDED') return '已结束';
  const labels: Record<ActivitySummaryDTO['availability']['state'], string> = {
    NO_REGISTRATION: '无需报名',
    NOT_OPEN: '报名未开始',
    OPEN: '报名中',
    CLOSED: '报名已截止',
    FULL: '名额已满',
    EXTERNAL: '外部参与',
    UNAVAILABLE: '暂不可参与',
  };
  return labels[raw.availability.state];
}

function capacityText(raw: ActivitySummaryDTO): string {
  if (raw.capacity === undefined) return '';
  return `${String(raw.capacity)} ${raw.capacityUnit === 'TEAM' ? '队' : '人'}`;
}

export function toCard(raw: ActivitySummaryDTO): ActivityCard {
  const projected = raw.cardTimeline ? formatTimelineSchedule(raw.cardTimeline.schedule) : null;
  return {
    id: raw.activityId,
    title: raw.title,
    summary: raw.summary,
    cover: raw.cover?.url,
    type: CATEGORY_LABELS[raw.category],
    typeIcon: '',
    typeColor: TYPE_COLORS[raw.category],
    scope: activityScopeLabels(raw.audienceScope),
    audienceScope: raw.audienceScope,
    location: raw.primaryLocation ?? '',
    organizer: raw.organizer,
    max_participants: raw.capacityUnit === 'PERSON' ? (raw.capacity ?? null) : null,
    capacityText: capacityText(raw),
    cardTimelineLabel: raw.cardTimeline?.title ?? '',
    cardTimelineText: projected?.text ?? '',
    cardTimelineKind: projected?.kind,
    deadlineText: raw.cardTimeline ? `${raw.cardTimeline.title} · ${projected?.text ?? ''}` : '',
    status: uiStatus(raw),
    statusLabel: statusLabel(raw),
    daysToDeadline: raw.cardTimeline ? exactCountdownDays(raw.cardTimeline.schedule) : null,
    enroll_deadline: '',
    published_at: '',
  };
}
