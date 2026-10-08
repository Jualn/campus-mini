import { isHttpError } from '../../utils/error';
import { eventApi } from './event-api';
import type {
  ActivityDetailDTO,
  ActivityRegistrationDTO,
  ContractRegistrationField,
  RegistrationAnswerDTO,
  WriteRegistrationRequestDTO,
} from '../../types/event-contract';
import type {
  MyRegistration,
  RegistrationAnswers,
  RegistrationField,
  RegistrationForm,
} from '../types/registration';
import { registrationApi } from './registration-api';

export class RegistrationValidationError extends Error {
  fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'RegistrationValidationError';
    this.fieldErrors = fieldErrors;
  }
}

function invalid(message: string, fieldErrors: Record<string, string> = {}): Error {
  return new RegistrationValidationError(message, fieldErrors);
}

function toField(field: ContractRegistrationField): RegistrationField {
  const inputMaxLength =
    field.purpose === 'STUDENT_NUMBER' ? 10 : field.purpose === 'PHONE' ? 11 : field.maxLength;
  return {
    key: field.fieldKey,
    label: field.label,
    helpText: field.helpText,
    purpose: field.purpose,
    type:
      field.type === 'SINGLE_SELECT'
        ? 'single_select'
        : field.type === 'MULTI_SELECT'
          ? 'multi_select'
          : 'text',
    required: field.required,
    maxLength: field.maxLength,
    inputType: field.purpose === 'STUDENT_NUMBER' || field.purpose === 'PHONE' ? 'number' : 'text',
    inputMaxLength,
    formatHint:
      field.purpose === 'STUDENT_NUMBER'
        ? '学号输入有误'
        : field.purpose === 'PHONE'
          ? '手机号输入有误'
          : undefined,
    options: field.options?.map((option) => ({
      value: option.optionKey,
      label: option.label,
    })),
  };
}

function toForm(detail: ActivityDetailDTO): RegistrationForm {
  if (
    !['MINI_PROGRAM', 'MINI_PROGRAM_AND_EXTERNAL'].includes(detail.registrationMode) ||
    !detail.registrationForm ||
    !detail.formVersion
  ) {
    throw invalid('当前活动不提供平台报名表');
  }
  return {
    activityId: detail.activityId,
    formVersion: detail.formVersion,
    fields: [...detail.registrationForm.fields]
      .sort((a, b) => a.displayOrder - b.displayOrder || a.fieldKey.localeCompare(b.fieldKey))
      .map(toField),
    allowModification: detail.registrationForm.allowModification,
    availability: detail.availability.state,
    registrationLimit: detail.capacity ?? null,
    submittedCount: detail.platformRegistrationCount?.submittedCount ?? 0,
  };
}

function responseEtag(headers: Record<string, string>): string {
  const etag = headers.etag;
  if (!etag) throw new Error('报名响应缺少 ETag，无法安全执行后续修改');
  return etag;
}

function toMine(raw: ActivityRegistrationDTO, etag: string): MyRegistration {
  return {
    id: raw.registrationId,
    activityId: raw.activityId,
    status: raw.status,
    formVersion: raw.formVersion,
    submittedAt: raw.submittedAt,
    updatedAt: raw.updatedAt,
    cancelledAt: raw.cancelledAt,
    canModify: raw.canModify,
    canCancel: raw.canCancel,
    etag,
    answers: Object.fromEntries(raw.answers.map((answer) => [answer.fieldKey, answer.value])),
  };
}

export async function readRegistrationForm(id: string): Promise<RegistrationForm> {
  return toForm(await eventApi.activities.detail(id));
}

export async function readMyRegistration(id: string): Promise<MyRegistration | null> {
  try {
    const response = await registrationApi.mine(id);
    return toMine(response.data, responseEtag(response.headers));
  } catch (error) {
    if (isHttpError(error) && error.statusCode === 404) return null;
    throw error;
  }
}

export function registrationTextError(field: RegistrationField, value: string): string {
  if (value.length > (field.maxLength ?? 2000)) {
    return `内容格式不正确或超过 ${String(field.maxLength ?? 2000)} 字`;
  }
  if (field.purpose === 'STUDENT_NUMBER' && !/^7\d{9}$/.test(value)) {
    return '请输入正确的学号';
  }
  if (field.purpose === 'PHONE' && !/^1[3-9]\d{9}$/.test(value)) {
    return '请输入有效的手机号';
  }
  return '';
}

export function prepareAnswers(
  fields: RegistrationField[],
  values: RegistrationAnswers,
): RegistrationAnswerDTO[] {
  const knownKeys = new Set(fields.map((field) => field.key));
  if (Object.keys(values).some((key) => !knownKeys.has(key))) {
    throw invalid('报名答案包含已失效字段，请重新加载表单');
  }
  const result: RegistrationAnswerDTO[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    const blank =
      value == null ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (blank) {
      if (field.required) fieldErrors[field.key] = '此项为必填，请完成后再提交';
      continue;
    }
    const allowed = new Set(field.options?.map((option) => option.value));
    if (field.type === 'text') {
      if (typeof value !== 'string') {
        fieldErrors[field.key] = '内容格式不正确';
        continue;
      }
      const textError = registrationTextError(field, value);
      if (textError) {
        fieldErrors[field.key] = textError;
        continue;
      }
      result.push({ fieldKey: field.key, value });
      continue;
    }
    if (field.type === 'single_select') {
      if (typeof value !== 'string' || !allowed.has(value)) {
        fieldErrors[field.key] = '请选择一个有效选项';
        continue;
      }
      result.push({ fieldKey: field.key, value });
      continue;
    }
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      new Set(value).size !== value.length ||
      value.some((item) => !allowed.has(item))
    ) {
      fieldErrors[field.key] = '请至少选择一个有效选项';
      continue;
    }
    result.push({ fieldKey: field.key, value });
  }
  const firstInvalidField = fields.find((field) => fieldErrors[field.key]);
  if (firstInvalidField) {
    throw invalid(`请检查“${firstInvalidField.label}”等标红字段`, fieldErrors);
  }
  return result;
}

export async function submitRegistration(
  id: string,
  form: RegistrationForm,
  values: RegistrationAnswers,
  mine: MyRegistration | null,
): Promise<MyRegistration> {
  const payload: WriteRegistrationRequestDTO = {
    formVersion: form.formVersion,
    answers: prepareAnswers(form.fields, values),
  };
  const response =
    mine?.status === 'SUBMITTED'
      ? await registrationApi.replace(id, payload, mine.etag)
      : await registrationApi.create(
          id,
          payload,
          mine?.status === 'CANCELLED' ? mine.etag : undefined,
        );
  return toMine(response.data, responseEtag(response.headers));
}

export async function cancelRegistration(
  id: string,
  mine: MyRegistration,
): Promise<MyRegistration> {
  const response = await registrationApi.cancel(id, mine.etag);
  return toMine(response.data, responseEtag(response.headers));
}
