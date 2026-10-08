import type { ParticipationAvailabilityState } from '../../types/event-contract';

export interface RegistrationField {
  key: string;
  label: string;
  helpText?: string;
  type: 'text' | 'single_select' | 'multi_select';
  purpose: 'NAME' | 'STUDENT_NUMBER' | 'CLASS' | 'PHONE' | 'CUSTOM';
  required: boolean;
  maxLength?: number;
  inputType?: 'text' | 'number';
  inputMaxLength?: number;
  formatHint?: string;
  options?: { value: string; label: string; checked?: boolean }[];
}

export type RegistrationAnswers = Record<string, string | string[] | null>;

export interface RegistrationForm {
  activityId: string;
  formVersion: string;
  fields: RegistrationField[];
  allowModification: boolean;
  availability: ParticipationAvailabilityState;
  registrationLimit: number | null;
  submittedCount: number;
}

export interface MyRegistration {
  id: string;
  activityId: string;
  status: 'SUBMITTED' | 'CANCELLED';
  formVersion: string;
  submittedAt: string;
  updatedAt: string;
  cancelledAt?: string;
  canModify: boolean;
  canCancel: boolean;
  etag: string;
  answers: RegistrationAnswers;
}
