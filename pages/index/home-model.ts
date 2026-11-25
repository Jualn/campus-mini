import type {
  ActivityStage,
  ExactPointTimelineSchedule,
  ExactRangeTimelineSchedule,
} from '../../types/event-contract';
import { activityStagePresentation } from '../../utils/activity-stage';
import { buildActivityDetailRoute } from '../../utils/routes';
import { formatTime, TimeStyle } from '../../utils/time-util';

interface HomeCover {
  url: string;
}

export interface HomeBannerSource {
  target: { targetType: 'ARTICLE' | 'ACTIVITY'; targetId: string };
  title: string;
  cover?: HomeCover;
}

export interface HomeArticleSource {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  cover?: HomeCover;
}

export interface HomeActivitySource {
  activityId: string;
  title: string;
  stage: ActivityStage & { state: 'NOT_STARTED' | 'ONGOING' };
  schedule: ExactPointTimelineSchedule | ExactRangeTimelineSchedule;
  cover?: HomeCover;
}

const articleDetailRoute = (id: string) =>
  `/subpkg_red/pages/article-detail/detail?articleId=${encodeURIComponent(id)}`;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad2 = (value: number) => value.toString().padStart(2, '0');

function exactDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS);
  return `${date.getUTCFullYear().toString()}.${pad2(date.getUTCMonth() + 1)}.${pad2(
    date.getUTCDate(),
  )} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

export function toHomeBanner(raw: HomeBannerSource) {
  const { targetType, targetId } = raw.target;
  const isArticle = targetType === 'ARTICLE';
  const key = `banner:${targetType}:${targetId}`;
  return {
    key,
    kindLabel: isArticle ? '文章' : '活动',
    title: raw.title,
    coverUrl: raw.cover?.url ?? '',
    coverKey: key,
    route: isArticle ? articleDetailRoute(targetId) : buildActivityDetailRoute(targetId),
  };
}

export function toHomeArticle(raw: HomeArticleSource) {
  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    publishedDate: formatTime(raw.publishedAt, TimeStyle.POST),
    coverUrl: raw.cover?.url ?? '',
    coverKey: `article:${raw.id}`,
    route: articleDetailRoute(raw.id),
  };
}

export function toHomeActivity(raw: HomeActivitySource) {
  const stage = activityStagePresentation(raw.stage);
  const schedule = raw.schedule;
  return {
    id: raw.activityId,
    title: raw.title,
    stageLabel: stage.label,
    stageStatus: stage.status,
    timeLabel:
      schedule.kind === 'EXACT_POINT'
        ? exactDateTime(schedule.time)
        : `${exactDateTime(schedule.startTime)} 至 ${exactDateTime(schedule.endTime)}`,
    coverUrl: raw.cover?.url ?? '',
    coverKey: `activity:${raw.activityId}`,
    route: buildActivityDetailRoute(raw.activityId),
  };
}
