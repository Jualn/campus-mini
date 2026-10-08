export type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
export type LifecycleStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface SubscriptionState {
  subscribed: boolean;
  subscribedAt?: string;
}

export type AttachmentKind = 'IMAGE' | 'POSTER' | 'QR_CODE' | 'PDF' | 'WORD' | 'LINK';

export interface EventAttachment {
  attachmentId: string;
  kind: AttachmentKind;
  name: string;
  url: string;
}

export interface ExactPointTimelineSchedule {
  kind: 'EXACT_POINT';
  time: string;
}

export interface ExactRangeTimelineSchedule {
  kind: 'EXACT_RANGE';
  startTime: string;
  endTime: string;
}

export interface DatePointTimelineSchedule {
  kind: 'DATE_POINT';
  date: string;
}

export interface DateRangeTimelineSchedule {
  kind: 'DATE_RANGE';
  startDate: string;
  endDate: string;
}

export interface TextTimelineSchedule {
  kind: 'TEXT';
  timeDescription: string;
}

export type TimelineSchedule =
  | ExactPointTimelineSchedule
  | ExactRangeTimelineSchedule
  | DatePointTimelineSchedule
  | DateRangeTimelineSchedule
  | TextTimelineSchedule;

export interface EventTimelineNode {
  nodeKey: string;
  type:
    | 'ACTIVITY_START'
    | 'PUBLIC_EVENT_START'
    | 'REGISTRATION_START'
    | 'REGISTRATION_END'
    | 'MATERIAL_SUBMISSION'
    | 'PRELIMINARY'
    | 'SEMIFINAL'
    | 'FINAL'
    | 'EXAM'
    | 'RESULT'
    | 'CERTIFICATE_COLLECTION'
    | 'ADMISSION_TICKET'
    | 'OTHER';
  title: string;
  description?: string;
  schedule: TimelineSchedule;
  location?: string;
  displayOrder: number;
}

export type CardTimeline = EventTimelineNode;

export interface EventSection {
  sectionKey: string;
  title: string;
  content: string;
  format: 'PLAIN_TEXT' | 'MARKDOWN';
  displayOrder: number;
}

export interface EventAction {
  actionKey: string;
  type:
    | 'JOIN_GROUP'
    | 'OFFICIAL_SITE'
    | 'EXTERNAL_REGISTRATION'
    | 'DOWNLOAD'
    | 'VIEW_ATTACHMENT'
    | 'EMAIL_SUBMISSION'
    | 'OFFICIAL_NOTICE'
    | 'OTHER';
  title: string;
  description?: string;
  url?: string;
  attachmentId?: string;
  displayOrder: number;
}

export interface EventContact {
  contactKey: string;
  name: string;
  contact: string;
  remark?: string;
}

export type ActivityCategory =
  | 'LECTURE'
  | 'COMPETITION'
  | 'SPORTS'
  | 'VOLUNTEERING'
  | 'THEMED'
  | 'OTHER';
export type RegistrationMode = 'NONE' | 'MINI_PROGRAM' | 'EXTERNAL' | 'MINI_PROGRAM_AND_EXTERNAL';
export type ParticipantMode = 'INDIVIDUAL' | 'TEAM';
export type CapacityUnit = 'PERSON' | 'TEAM';
export type ParticipationAvailabilityState =
  | 'NO_REGISTRATION'
  | 'NOT_OPEN'
  | 'OPEN'
  | 'CLOSED'
  | 'FULL'
  | 'EXTERNAL'
  | 'UNAVAILABLE';

export type AudienceScope = { type: 'CAMPUS' } | { type: 'DEPARTMENTS'; departmentIds: string[] };

export interface ParticipationAvailability {
  state: ParticipationAvailabilityState;
  evaluatedAt: string;
}

export interface PlatformRegistrationCount {
  submittedCount: number;
  asOf: string;
}

export interface ContractRegistrationOption {
  optionKey: string;
  label: string;
}

export interface ContractRegistrationField {
  fieldKey: string;
  label: string;
  purpose: 'NAME' | 'STUDENT_NUMBER' | 'CLASS' | 'PHONE' | 'CUSTOM';
  type: 'TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT';
  required: boolean;
  helpText?: string;
  maxLength?: number;
  options?: ContractRegistrationOption[];
  displayOrder: number;
}

export interface ContractRegistrationForm {
  fields: ContractRegistrationField[];
  allowModification: boolean;
}

export interface ActivitySummaryDTO {
  activityId: string;
  title: string;
  summary: string;
  category: ActivityCategory;
  organizer: string;
  audienceScope: AudienceScope;
  audienceSummary: string;
  primaryLocation?: string;
  cardTimeline?: CardTimeline;
  registrationMode: RegistrationMode;
  participantMode: ParticipantMode;
  capacity?: number;
  capacityUnit?: CapacityUnit;
  cover?: EventAttachment;
  publishStatus: PublishStatus;
  lifecycleStatus: LifecycleStatus;
  availability: ParticipationAvailability;
  platformRegistrationCount?: PlatformRegistrationCount;
}

export interface ActivityDetailDTO extends ActivitySummaryDTO {
  timeline: EventTimelineNode[];
  sections: EventSection[];
  actions: EventAction[];
  contacts: EventContact[];
  attachments: EventAttachment[];
  registrationForm?: ContractRegistrationForm;
  formVersion?: string;
}

export interface ActivityCursorPageDTO {
  items: ActivitySummaryDTO[];
  nextCursor?: string;
}

export type PublicEventType = 'EXAM' | 'COMPETITION' | 'CERTIFICATION' | 'OTHER';

export interface PublicEventSummaryDTO {
  publicEventId: string;
  title: string;
  summary: string;
  type: PublicEventType;
  sourceName: string;
  sourceUrl?: string;
  officialUrl?: string;
  cardTimeline?: CardTimeline;
  cover?: EventAttachment;
  publishStatus: PublishStatus;
  lifecycleStatus: LifecycleStatus;
}

export interface PublicEventDetailDTO extends PublicEventSummaryDTO {
  timeline: EventTimelineNode[];
  sections: EventSection[];
  actions: EventAction[];
  contacts: EventContact[];
  attachments: EventAttachment[];
}

export interface PublicEventCursorPageDTO {
  items: PublicEventSummaryDTO[];
  nextCursor?: string;
}

export interface RegistrationAnswerDTO {
  fieldKey: string;
  value: string | string[];
}

export interface WriteRegistrationRequestDTO {
  formVersion: string;
  answers: RegistrationAnswerDTO[];
}

export interface ActivityRegistrationDTO {
  registrationId: string;
  activityId: string;
  status: 'SUBMITTED' | 'CANCELLED';
  formVersion: string;
  answers: RegistrationAnswerDTO[];
  submittedAt: string;
  updatedAt: string;
  cancelledAt?: string;
  canModify: boolean;
  canCancel: boolean;
}
