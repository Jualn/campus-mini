import type { ActivityStage } from '../types/event-contract';
import type { ActivityUiStatus } from '../types/activity';

const UNKNOWN: { status: ActivityUiStatus; label: string } = {
  status: 'unknown',
  label: '阶段待确认',
};
const STAGES: Record<string, { status: ActivityUiStatus; label: string } | undefined> = {
  NOT_STARTED: { status: 'not_started', label: '未开始' },
  ONGOING: { status: 'ongoing', label: '进行中' },
  ENDED: { status: 'ended', label: '已结束' },
  CANCELLED: { status: 'cancelled', label: '已取消举办' },
  UNKNOWN: { status: 'unknown', label: '阶段待确认' },
};

export function activityStagePresentation(stage?: ActivityStage) {
  return STAGES[stage?.state ?? 'UNKNOWN'] ?? UNKNOWN;
}
