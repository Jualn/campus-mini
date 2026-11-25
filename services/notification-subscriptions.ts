import { api } from './api';
import type {
  NotificationCategory,
  NotificationSubscriptionOption,
  NotificationSubscriptionOptions,
} from '../types/api';

export interface SubscriptionBatch {
  key: string;
  category: NotificationCategory;
  items: NotificationSubscriptionOption[];
}

export const getSubscriptionOptions = async () => {
  const options =
    (await api.notify.getSubscriptionOptions()) as Partial<NotificationSubscriptionOptions> | null;
  if (
    !options ||
    typeof options.configurationRevision !== 'string' ||
    !options.configurationRevision ||
    typeof options.evaluatedAt !== 'string' ||
    typeof options.maxTemplatesPerRequest !== 'number' ||
    !Number.isInteger(options.maxTemplatesPerRequest) ||
    options.maxTemplatesPerRequest < 1 ||
    !Array.isArray(options.items)
  ) {
    throw new Error('提醒暂不可用');
  }
  const ids = new Set<string>();
  for (const candidate of options.items) {
    const item = candidate as Partial<NotificationSubscriptionOption> | null;
    if (
      !item ||
      typeof item.templateId !== 'string' ||
      !item.templateId ||
      ids.has(item.templateId) ||
      typeof item.title !== 'string' ||
      !item.title ||
      typeof item.subscriptionKind !== 'string' ||
      !Array.isArray(item.categories) ||
      !item.categories.length ||
      item.categories.some((value) => typeof value !== 'string' || !value) ||
      !Array.isArray(item.notificationTypes) ||
      !item.notificationTypes.length ||
      item.notificationTypes.some((value) => typeof value !== 'string' || !value)
    ) {
      throw new Error('提醒暂不可用');
    }
    ids.add(item.templateId);
  }
  return options as NotificationSubscriptionOptions;
};

// Use the verified three-template capability on supported WeChat clients.
// Unknown/older hosts use one; newer host limits never raise this verified ceiling.
export const getLocalTemplateLimit = () => {
  try {
    const { version } = wx.getAppBaseInfo();
    const { platform } = wx.getDeviceInfo();
    const parts = version.split('.').map(Number);
    const minimum = platform === 'ios' ? [7, 0, 6] : platform === 'android' ? [7, 0, 7] : null;
    if (!minimum || parts.length < 3 || parts.some((part) => !Number.isInteger(part))) return 1;
    for (let index = 0; index < 3; index++) {
      if (parts[index] > minimum[index]) return 3;
      if (parts[index] < minimum[index]) return 1;
    }
    return 3;
  } catch {
    return 1;
  }
};

export const buildSubscriptionBatches = (
  options: NotificationSubscriptionOptions,
  category: NotificationCategory,
  localLimit: number,
): SubscriptionBatch[] => {
  const limit = Math.max(1, Math.min(options.maxTemplatesPerRequest, localLimit));
  const batches: SubscriptionBatch[] = [];
  const seen = new Set<string>();
  for (const item of options.items) {
    if (
      !item.categories.includes(category) ||
      seen.has(item.templateId) ||
      !['ONE_TIME', 'LONG_TERM'].includes(item.subscriptionKind)
    )
      continue;
    seen.add(item.templateId);
    let batch = batches.find(
      (candidate) =>
        candidate.items.length < limit &&
        candidate.items[0].subscriptionKind === item.subscriptionKind &&
        candidate.items.every((existing) => existing.title !== item.title),
    );
    if (!batch) {
      batch = { key: `${category}:${String(batches.length)}`, category, items: [] };
      batches.push(batch);
    }
    batch.items.push(item);
  }
  return batches;
};

export const subscriptionResultText = (status: string | undefined) => {
  switch (status) {
    case 'accept':
    case 'acceptWithAlert':
    case 'acceptWithAudio':
    case 'acceptWithForcePush':
      return '本次订阅成功';
    case 'reject':
      return '未同意订阅，可去设置调整';
    case 'ban':
    case 'filter':
      return '暂不可用';
    default:
      return '订阅结果暂无法确认';
  }
};
