import { eventApi, type EventListQuery } from './event-api';
import type {
  EventAction,
  EventAttachment,
  PublicEventDetailDTO,
  PublicEventSummaryDTO,
} from '../../types/event-contract';
import type { PublicEventCard, PublicEventDetail } from '../../types/business';
import { exactCountdownDays, formatTimelineSchedule, sortTimeline } from '../utils/event-timeline';

const TYPE_LABELS: Record<PublicEventSummaryDTO['type'], string> = {
  EXAM: '考试',
  COMPETITION: '竞赛',
  CERTIFICATION: '认证',
  OTHER: '公共事项',
};

const TYPE_PRESENTATION: Record<PublicEventSummaryDTO['type'], { mark: string; tone: string }> = {
  EXAM: { mark: '考', tone: 'blue' },
  COMPETITION: { mark: '赛', tone: 'purple' },
  CERTIFICATION: { mark: '证', tone: 'orange' },
  OTHER: { mark: '事', tone: 'slate' },
};

export function toPublicEventCard(raw: PublicEventSummaryDTO): PublicEventCard {
  const projected = raw.cardTimeline ? formatTimelineSchedule(raw.cardTimeline.schedule) : null;
  const presentation = TYPE_PRESENTATION[raw.type];
  return {
    id: raw.publicEventId,
    title: raw.title,
    summary: raw.summary,
    icon: '/assets/icons/common/exam.svg',
    color: presentation.tone,
    typeLabel: TYPE_LABELS[raw.type],
    typeMark: presentation.mark,
    sourceName: raw.sourceName,
    frequency: `${TYPE_LABELS[raw.type]} · ${raw.sourceName}`,
    statusLabel:
      raw.lifecycleStatus === 'CANCELLED'
        ? '事项已取消'
        : raw.lifecycleStatus === 'ENDED'
          ? '事项已结束'
          : '当前有效',
    statusTone:
      raw.lifecycleStatus === 'CANCELLED'
        ? 'cancelled'
        : raw.lifecycleStatus === 'ENDED'
          ? 'ended'
          : 'active',
    nextNodeLabel: raw.cardTimeline?.title ?? '',
    nextDate: projected?.text ?? '',
    scheduleKind: projected?.kind ?? '',
    daysLeft: raw.cardTimeline ? exactCountdownDays(raw.cardTimeline.schedule) : null,
  };
}

export async function getPublicEventCards(
  query: EventListQuery & { keyword?: string; lastId?: string; type?: string } = {},
) {
  const cursor = (query.cursor ?? query.lastId)?.trim();
  const keyword = (query.q ?? query.keyword)?.trim();
  const result = await eventApi.publicEvents.list({
    cursor: cursor?.length ? cursor : undefined,
    pageSize: query.pageSize,
    q: keyword?.length ? keyword : undefined,
    sort: '-publishedAt',
    lifecycleStatus: query.lifecycleStatus,
    type: query.type,
  });
  return {
    items: result.items.map(toPublicEventCard),
    hasMore: Boolean(result.nextCursor),
    nextCursor: result.nextCursor ?? '',
  };
}

function resourceKind(item: EventAttachment): PublicEventDetail['resources'][number]['kind'] {
  if (['IMAGE', 'POSTER', 'QR_CODE'].includes(item.kind)) return 'image';
  if (item.kind === 'PDF' || item.kind === 'WORD') return 'document';
  return 'copy';
}

function fileType(item: EventAttachment): string {
  if (item.kind === 'PDF') return 'pdf';
  if (item.kind === 'WORD') return /\.doc(?:x)?(?:[?#]|$)/i.test(item.url) ? 'docx' : 'doc';
  return '';
}

function actionResource(
  item: EventAction,
  attachments: EventAttachment[],
): PublicEventDetail['resources'][number] {
  const attachment = item.attachmentId
    ? attachments.find((candidate) => candidate.attachmentId === item.attachmentId)
    : undefined;
  return {
    key: item.actionKey,
    label: item.title,
    desc: item.description ?? '',
    url: attachment?.url ?? item.url ?? '',
    primary: item.type === 'EXTERNAL_REGISTRATION' || item.type === 'OFFICIAL_SITE',
    kind: attachment ? resourceKind(attachment) : item.url ? 'copy' : 'text',
    fileType: attachment ? fileType(attachment) : '',
  };
}

export function toPublicEventDetail(
  raw: PublicEventDetailDTO,
  subscribed: boolean,
): PublicEventDetail {
  const attachments = [...raw.attachments];
  const resources = [...raw.actions]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.actionKey.localeCompare(b.actionKey))
    .map((item) => actionResource(item, attachments));
  const referenced = new Set(raw.actions.map((item) => item.attachmentId).filter(Boolean));
  resources.push(
    ...attachments
      .filter((item) => !referenced.has(item.attachmentId))
      .map((item) => ({
        key: item.attachmentId,
        label: item.name,
        desc: '',
        url: item.url,
        primary: false,
        kind: resourceKind(item),
        fileType: fileType(item),
      })),
  );
  for (const [key, label, url] of [
    ['official-url', '官方网站', raw.officialUrl],
    ['source-url', '信息来源', raw.sourceUrl],
  ] as const) {
    if (url && !resources.some((item) => item.url === url)) {
      resources.push({ key, label, desc: '', url, primary: false, kind: 'copy', fileType: '' });
    }
  }
  const lifecycleLabels: Record<PublicEventDetailDTO['lifecycleStatus'], string> = {
    ACTIVE: '有效',
    ENDED: '已结束',
    CANCELLED: '已取消',
  };
  return {
    id: raw.publicEventId,
    title: raw.title,
    summary: raw.summary,
    icon: '/assets/icons/common/exam.svg',
    color: 'blue',
    organizer: raw.sourceName,
    frequency: TYPE_LABELS[raw.type],
    timeSource: raw.sourceUrl ? '时间与事项信息以来源页面更新为准' : '',
    subscribed,
    canSubscribe: raw.publishStatus === 'PUBLISHED' && raw.lifecycleStatus === 'ACTIVE',
    cover: raw.cover?.url ?? '',
    sections: [...raw.sections]
      .sort((a, b) => a.displayOrder - b.displayOrder || a.sectionKey.localeCompare(b.sectionKey))
      .map((item) => ({ key: item.sectionKey, title: item.title, content: item.content })),
    info: [
      { label: '事项类型', value: TYPE_LABELS[raw.type] },
      { label: '当前状态', value: lifecycleLabels[raw.lifecycleStatus] },
      { label: '信息来源', value: raw.sourceName },
      ...raw.contacts.map((item) => ({
        label: item.name,
        value: [item.contact, item.remark].filter(Boolean).join(' · '),
      })),
    ],
    timeline: sortTimeline(raw.timeline).map((item) => {
      const display = formatTimelineSchedule(item.schedule);
      return {
        key: item.nodeKey,
        label: item.title,
        scheduleKind: display.kind,
        scheduleKindLabel: display.kindLabel,
        scheduleText: display.text,
        date: display.dateText,
        time: display.timeText,
        note: [item.description, item.location].filter(Boolean).join(' · '),
      };
    }),
    resources,
  };
}

export async function getPublicEventDetail(id: string): Promise<PublicEventDetail> {
  if (!id) throw new Error('publicEventId不能为空');
  const [detail, subscription] = await Promise.all([
    eventApi.publicEvents.detail(id),
    eventApi.publicEvents.subscription(id),
  ]);
  return toPublicEventDetail(detail, subscription.subscribed);
}

export async function setPublicEventSubscription(
  id: string,
  subscribed: boolean,
): Promise<boolean> {
  if (subscribed) return (await eventApi.publicEvents.subscribe(id)).subscribed;
  await eventApi.publicEvents.unsubscribe(id);
  return false;
}
