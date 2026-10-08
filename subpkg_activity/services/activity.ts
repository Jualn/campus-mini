import { api } from '../../services/api';
import { eventApi } from './event-api';
import type { ActivityCreateRequest, ActivityUploadBO } from '../../types/api';
import type { ActivityCard, ActivityDetail, ServiceCursorPage } from '../../types/business';
import type {
  ActivityDetailDTO,
  ActivitySummaryDTO,
  EventAction,
  EventAttachment,
  EventTimelineNode,
} from '../../types/event-contract';
import type {
  ActivityUiStatus,
  Attachment,
  TimelineNode,
  TimelineNodeStatus,
} from '../../types/activity';
import {
  exactCountdownDays,
  formatTimelineSchedule,
  sortTimeline,
  timelineStatus,
} from '../utils/event-timeline';

const CATEGORY_LABELS: Record<ActivitySummaryDTO['category'], string> = {
  LECTURE: '学术讲座',
  COMPETITION: '文体比赛',
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

function toCard(raw: ActivitySummaryDTO): ActivityCard {
  const projected = raw.cardTimeline ? formatTimelineSchedule(raw.cardTimeline.schedule) : null;
  return {
    id: raw.activityId,
    title: raw.title,
    summary: raw.summary,
    cover: raw.cover?.url,
    type: CATEGORY_LABELS[raw.category],
    typeIcon: '',
    typeColor: TYPE_COLORS[raw.category],
    scope: [raw.audienceSummary],
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

function toTimeline(items: EventTimelineNode[]): TimelineNode[] {
  return sortTimeline(items).map((node) => {
    const display = formatTimelineSchedule(node.schedule);
    const status: TimelineNodeStatus = timelineStatus(node.schedule);
    return {
      key: node.nodeKey,
      label: node.title,
      scheduleKind: display.kind,
      scheduleKindLabel: display.kindLabel,
      scheduleText: display.text,
      date: display.dateText,
      time: display.timeText,
      endText: display.endText,
      note: [node.description, node.location].filter(Boolean).join(' · '),
      status,
    };
  });
}

function attachmentType(item: EventAttachment): string {
  if (item.kind === 'IMAGE' || item.kind === 'POSTER' || item.kind === 'QR_CODE') return 'image';
  if (item.kind === 'PDF') return 'pdf';
  if (item.kind === 'WORD') return 'docx';
  return 'link';
}

function actionType(item: EventAction): number {
  const values: Record<EventAction['type'], number> = {
    OFFICIAL_SITE: 1,
    JOIN_GROUP: 5,
    EMAIL_SUBMISSION: 3,
    DOWNLOAD: 6,
    VIEW_ATTACHMENT: 6,
    EXTERNAL_REGISTRATION: 1,
    OFFICIAL_NOTICE: 1,
    OTHER: 8,
  };
  return values[item.type];
}

function toDetail(raw: ActivityDetailDTO, subscribed: boolean): ActivityDetail {
  const sortedAttachments = [...raw.attachments];
  const attachments: Attachment[] = sortedAttachments.map((item) => ({
    type: attachmentType(item),
    name: item.name,
    url: item.url,
  }));
  const actions = [...raw.actions]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.actionKey.localeCompare(b.actionKey))
    .map((item) => {
      const attachmentIndex = item.attachmentId
        ? sortedAttachments.findIndex((attachment) => attachment.attachmentId === item.attachmentId)
        : -1;
      return {
        key: item.actionKey,
        actionType: actionType(item),
        typeLabel: item.type === 'EXTERNAL_REGISTRATION' ? '报名链接' : '参与入口',
        attachmentUrl: attachmentIndex >= 0 ? sortedAttachments[attachmentIndex].url : '',
        label: item.title,
        description: item.description ?? '',
        targetValue: item.url ?? '',
        attachmentIndex,
        isRequired: item.type === 'EXTERNAL_REGISTRATION',
      };
    });
  const card = toCard(raw);
  const registrationMode =
    raw.registrationMode === 'MINI_PROGRAM'
      ? 2
      : raw.registrationMode === 'EXTERNAL'
        ? 3
        : raw.registrationMode === 'MINI_PROGRAM_AND_EXTERNAL'
          ? 4
          : 1;

  return {
    ...card,
    subscribed,
    canSubscribe: raw.publishStatus === 'PUBLISHED' && raw.lifecycleStatus === 'ACTIVE',
    registrationMode,
    availability: raw.availability.state,
    registrationForm: raw.registrationForm
      ? {
          allowModification: raw.registrationForm.allowModification,
          fields: [...raw.registrationForm.fields]
            .sort((a, b) => a.displayOrder - b.displayOrder || a.fieldKey.localeCompare(b.fieldKey))
            .map((field) => ({
              key: field.fieldKey,
              label: field.label,
              helpText: field.helpText,
              required: field.required,
              typeLabel:
                field.type === 'TEXT' ? '填写' : field.type === 'SINGLE_SELECT' ? '单选' : '多选',
            })),
        }
      : undefined,
    sections: [...raw.sections]
      .sort((a, b) => a.displayOrder - b.displayOrder || a.sectionKey.localeCompare(b.sectionKey))
      .map((item) => ({ key: item.sectionKey, title: item.title, content: item.content })),
    actions,
    hasParticipation: registrationMode !== 1 || actions.length > 0,
    deadlineSummary: statusLabel(raw),
    registrationLabel: statusLabel(raw),
    platformRegistrationText: raw.platformRegistrationCount
      ? `平台已提交 ${String(raw.platformRegistrationCount.submittedCount)} 份`
      : '',
    timeDescription: card.cardTimelineText ?? '',
    audienceSummary: raw.audienceSummary,
    startDateShort: card.cardTimelineText?.length ? card.cardTimelineText : '详见时间线',
    description: raw.summary,
    start_time: card.cardTimelineText?.length ? card.cardTimelineText : '详见时间线',
    end_time: '',
    timeline: toTimeline(raw.timeline),
    join_method: '',
    contacts: raw.contacts.map((item) => ({
      name: item.name,
      note: [item.contact, item.remark].filter(Boolean).join(' · '),
    })),
    attachments,
    is_cancelled: raw.lifecycleStatus === 'CANCELLED',
    enroll_deadline: '',
  };
}

export const create = (payload: ActivityCreateRequest): Promise<string> =>
  api.activity.create(payload);

export async function getActivityList(
  options: { lastId?: string; pageSize?: number; keyword?: string } = {},
): Promise<ServiceCursorPage<ActivityCard>> {
  const cursor = options.lastId?.trim();
  const keyword = options.keyword?.trim();
  const page = await eventApi.activities.list({
    cursor: cursor?.length ? cursor : undefined,
    pageSize: options.pageSize ?? 20,
    q: keyword?.length ? keyword : undefined,
    sort: '-publishedAt',
  });
  return {
    list: page.items.map(toCard),
    hasMore: Boolean(page.nextCursor),
    nextCursor: page.nextCursor,
  };
}

export async function getActivityDetail(activityId: string): Promise<ActivityDetail> {
  if (!activityId) throw new Error('activityId不能为空');
  const [detail, subscription] = await Promise.all([
    eventApi.activities.detail(activityId),
    eventApi.activities.subscription(activityId),
  ]);
  return toDetail(detail, subscription.subscribed);
}

export async function setActivitySubscription(id: string, subscribed: boolean): Promise<boolean> {
  if (subscribed) return (await eventApi.activities.subscribe(id)).subscribed;
  await eventApi.activities.unsubscribe(id);
  return false;
}

export const upload = (filePath: string): Promise<ActivityUploadBO> => {
  if (!filePath) return Promise.reject(new Error('filePath不能为空'));
  return api.activity.upload(filePath);
};

export const activtyPublishStream = <T>(
  taskId: string,
  skipped?: string,
  parser?: (line: string) => T,
) => api.activity.activtyPublishStream<T>(taskId, skipped, parser);
