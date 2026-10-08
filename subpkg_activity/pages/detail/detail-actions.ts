import type { ParticipationAvailabilityState } from '../../../types/event-contract';

export type DetailRegistrationStatus = 'SUBMITTED' | 'CANCELLED' | '';

export interface DetailPrimaryAction {
  kind: 'registration' | 'participation' | 'external-actions';
  label: string;
  disabled: boolean;
}

function unavailableAction(
  availability: ParticipationAvailabilityState | undefined,
): DetailPrimaryAction {
  const labels: Partial<Record<ParticipationAvailabilityState, string>> = {
    NOT_OPEN: '报名未开始',
    FULL: '名额已满',
    CLOSED: '报名已截止',
    UNAVAILABLE: '当前不可报名',
  };
  return {
    kind: 'registration',
    label: availability ? (labels[availability] ?? '当前不可报名') : '当前不可报名',
    disabled: true,
  };
}

export function resolveDetailPrimaryAction(
  registrationMode: number | undefined,
  availability: ParticipationAvailabilityState | undefined,
  registrationStatus: DetailRegistrationStatus,
): DetailPrimaryAction | null {
  if (registrationMode === 1 || registrationMode === undefined) return null;

  if (registrationMode === 3) {
    return { kind: 'participation', label: '查看参与方式', disabled: false };
  }

  if (registrationMode === 4 && registrationStatus === 'SUBMITTED') {
    return { kind: 'external-actions', label: '查看后续步骤', disabled: false };
  }

  if (registrationStatus === 'SUBMITTED') {
    return { kind: 'registration', label: '查看报名', disabled: false };
  }

  if (availability !== 'OPEN') return unavailableAction(availability);

  if (registrationMode === 4) {
    return { kind: 'registration', label: '填写报名表', disabled: false };
  }

  return {
    kind: 'registration',
    label: registrationStatus === 'CANCELLED' ? '重新报名' : '立即报名',
    disabled: false,
  };
}
