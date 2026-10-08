import { api } from './api';

export interface HomePublicMatterReminder {
  publicMatterId: string;
  name: string;
  nodeName: string;
  reminderAt: string;
  reminderAtMs: number;
}

export interface HomePublicMatterReminderSnapshot {
  evaluatedAt: string;
  evaluatedAtMs: number;
  receivedAtMs: number;
  source: 'SUBSCRIPTIONS' | 'DEFAULT';
  items: HomePublicMatterReminder[];
}

const OFFSET_DATE_TIME = /(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function parseContractTime(value: unknown, field: string): number {
  if (typeof value !== 'string' || !OFFSET_DATE_TIME.test(value)) {
    throw new Error(`主页提醒响应中的 ${field} 缺少明确时区`);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`主页提醒响应中的 ${field} 不是有效时间`);
  return timestamp;
}

function mapReminder(raw: unknown, evaluatedAtMs: number): HomePublicMatterReminder {
  if (
    !isRecord(raw) ||
    typeof raw.publicMatterId !== 'string' ||
    !raw.publicMatterId ||
    typeof raw.name !== 'string' ||
    !raw.name ||
    typeof raw.nodeName !== 'string' ||
    !raw.nodeName ||
    typeof raw.reminderAt !== 'string'
  ) {
    throw new Error('主页提醒响应包含无效事项');
  }

  const reminderAtMs = parseContractTime(raw.reminderAt, 'reminderAt');
  if (reminderAtMs <= evaluatedAtMs) throw new Error('主页提醒响应包含已结束节点');

  return {
    publicMatterId: raw.publicMatterId,
    name: raw.name,
    nodeName: raw.nodeName,
    reminderAt: raw.reminderAt,
    reminderAtMs,
  };
}

export function normalizeHomePublicMatterReminders(
  raw: unknown,
  receivedAtMs = Date.now(),
): HomePublicMatterReminderSnapshot {
  if (
    !isRecord(raw) ||
    typeof raw.evaluatedAt !== 'string' ||
    (raw.source !== 'SUBSCRIPTIONS' && raw.source !== 'DEFAULT') ||
    !Array.isArray(raw.items) ||
    raw.items.length > 5
  ) {
    throw new Error('主页提醒响应格式无效');
  }

  const evaluatedAtMs = parseContractTime(raw.evaluatedAt, 'evaluatedAt');
  const items = raw.items.map((item: unknown) => mapReminder(item, evaluatedAtMs));
  const uniqueIds = new Set(items.map((item) => item.publicMatterId));
  if (uniqueIds.size !== items.length) throw new Error('主页提醒响应包含重复事项');

  return {
    evaluatedAt: raw.evaluatedAt,
    evaluatedAtMs,
    receivedAtMs,
    source: raw.source,
    items,
  };
}

export async function getHomePublicMatterReminders() {
  const response = await api.home.getPublicMatterReminders();
  return normalizeHomePublicMatterReminders(response);
}
