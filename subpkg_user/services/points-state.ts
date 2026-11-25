import type {
  AcceptingOrganizations,
  ApplicationStatus,
  PointApplication,
  PointEligibility,
  PointFile,
} from './points';

// Legacy name: these flags describe available client flows, not remote Provider readiness.
// Real Provider/runtime validation remains separate. Never probe admin capabilities.
export const pointsProvider: Readonly<{ submissionReady: boolean; closeReady: boolean }> = {
  submissionReady: true,
  closeReady: true,
};

export function pointStatusTone(status: ApplicationStatus) {
  return {
    PENDING: 'warning',
    APPROVED: 'success',
    REJECTED: 'danger',
    CLOSED: 'muted',
  }[status];
}

export function pointTimeText(value?: string) {
  if (!value) return '';
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(parsed.getFullYear())}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

export function pointMaterialView(kind: PointFile['kind']) {
  return {
    IMAGE: { kindLabel: '图片', previewLabel: '图片材料' },
    PDF: { kindLabel: 'PDF', previewLabel: 'PDF 文档' },
    WORD: { kindLabel: 'DOC', previewLabel: 'Word 文档' },
    VIDEO: { kindLabel: '视频', previewLabel: '视频材料' },
  }[kind];
}

export function pointSubmissionView(
  eligibility?: PointEligibility,
  organizations?: AcceptingOrganizations,
  selected = '',
) {
  const items = organizations?.items ?? [];
  const selectedId =
    items.length === 1
      ? items[0].organizationId
      : items.some((item) => item.organizationId === selected)
        ? selected
        : '';
  return {
    items,
    selectedId,
    // Missing/failed responses are unknown, never an assertion of verified absence.
    qualificationKnown: !!eligibility && !!organizations,
    showApply: pointsProvider.submissionReady && eligibility?.eligible === true && items.length > 0,
    canSubmit: pointsProvider.submissionReady && eligibility?.eligible === true && !!selectedId,
    message: !pointsProvider.submissionReady
      ? '积分申报暂未开放'
      : !eligibility || !organizations
        ? '申报资格暂不可确认，请重新查询'
        : !eligibility.eligible
          ? eligibility.reason === 'NO_BINDING'
            ? '请先关联人员档案'
            : eligibility.reason === 'PERSON_UNAVAILABLE'
              ? '人员档案当前不可用'
              : eligibility.reason === 'NO_ACCEPTING_ORGANIZATION'
                ? '暂无合法受理组织，暂不能申报；历史记录保留'
                : '当前账号或有效业务阶段不满足申报条件'
          : !items.length
            ? '暂无合法受理组织，暂不能申报；历史记录保留'
            : !selectedId
              ? '请选择一个受理组织'
              : '',
  };
}

export function pointApplicationView(
  application: PointApplication,
  organizations?: AcceptingOrganizations,
) {
  const basis = application.acceptanceBasis;
  const pending = application.status === 'PENDING';
  const cycleUnavailable =
    !!organizations &&
    !organizations.items.some(
      (item) =>
        item.organizationId === basis.organizationId && item.membershipId === basis.membershipId,
    );
  return {
    statusLabel: {
      PENDING: '待审核',
      APPROVED: '已通过',
      REJECTED: '已驳回',
      CLOSED: '本人已结束',
    }[application.status],
    canClose: pointsProvider.closeReady && pending,
    // Failed candidate reads do not establish that an original cycle has ended.
    acceptanceUnknown: pending && !organizations,
    cannotContinueReview: pending && cycleUnavailable,
    message:
      pending && cycleUnavailable
        ? '原成员周期/受理资格已失效，不能继续审批；可由本人结束旧申请，历史保留。旧申请不转交、不重开，新申请需重新核实资格和提交材料'
        : application.status === 'CLOSED'
          ? '旧申请及材料已保留；新申报需重新核实资格、选择组织和提交材料'
          : '',
  };
}
