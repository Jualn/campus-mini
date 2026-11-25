import type { ActivitySummaryDTO } from '../types/event-contract';

// Canonical: contracts/api/schemas/activity.yaml#ActivityDepartmentId.
export const ACTIVITY_DEPARTMENTS = [
  { id: 'information', label: '信息学科部' },
  { id: 'science', label: '理工学科部' },
  { id: 'finance', label: '财经学科部' },
  { id: 'humanities', label: '人文学科部' },
  { id: 'foundation', label: '基础学科部' },
] as const;

export type ActivityDepartmentId = (typeof ACTIVITY_DEPARTMENTS)[number]['id'];

export function activityScopeLabels(
  scope: ActivitySummaryDTO['audienceScope'] | undefined,
  preferredDepartment = '',
  compact = false,
): string[] {
  if (scope?.type === 'CAMPUS') return ['全院'];
  if (scope?.type !== 'DEPARTMENTS' || !scope.departmentIds.length) return ['范围待确认'];
  const ids = [...new Set(scope.departmentIds)];
  const ordered = ids.includes(preferredDepartment)
    ? [preferredDepartment, ...ids.filter((id) => id !== preferredDepartment)]
    : ids;
  const labels = ordered.map(
    (id) => ACTIVITY_DEPARTMENTS.find((department) => department.id === id)?.label ?? '范围待确认',
  );
  return compact && labels.length > 2
    ? [
        ...labels.slice(0, 2),
        `等 ${String(labels.length)} 个学科部${labels.slice(2).includes('范围待确认') ? ' · 范围待确认' : ''}`,
      ]
    : labels;
}
