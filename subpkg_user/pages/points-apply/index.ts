import { createBusinessSubscription } from '../../../services/business-subscriptions';
import { createLeaveGuard } from '../../../utils/leave-guard';
import definePage from '../../../utils/definePage';
import { chooseMessageFile } from '../../../utils/wx-promise';
import { watchPersonBinding } from '../../../services/person-binding';
import {
  pointApplicationView,
  pointMaterialView,
  pointStatusTone,
  pointSubmissionView,
} from '../../services/points-state';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import {
  getMyPointsEligibility,
  listMyPointAcceptingOrganizations,
  fileDeclaration,
  pointsErrorMessage,
  type FileDeclaration,
  type AcceptingOrganization,
  type PointApplication,
} from '../../services/points';
import {
  pointApplicationOperation,
  pointFileUploadOperation,
} from '../../services/points-operation';

interface Material {
  key: number;
  name: string;
  typeLabel: string;
  status: string;
  fileId: string;
  operation: ReturnType<typeof pointFileUploadOperation>;
}
const formats: Partial<Record<string, Pick<FileDeclaration, 'kind' | 'contentType'>>> = {
  mp4: { kind: 'VIDEO', contentType: 'video/mp4' },
  jpg: { kind: 'IMAGE', contentType: 'image/jpeg' },
  jpeg: { kind: 'IMAGE', contentType: 'image/jpeg' },
  png: { kind: 'IMAGE', contentType: 'image/png' },
  webp: { kind: 'IMAGE', contentType: 'image/webp' },
  pdf: { kind: 'PDF', contentType: 'application/pdf' },
  doc: { kind: 'WORD', contentType: 'application/msword' },
  docx: {
    kind: 'WORD',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
};
const reasons: Record<string, string> = {
  NO_BINDING: '请先关联人员档案后再申请',
  PERSON_UNAVAILABLE: '人员档案当前不可用，请联系管理员核实',
  BUSINESS_STAGE_INELIGIBLE: '当前业务阶段不具备积分申请资格',
  ACCOUNT_UNAVAILABLE: '当前账号不可申请',
  NO_ACCEPTING_ORGANIZATION: '当前没有可受理的组织，请联系管理员核实',
};

definePage({
  _leaveGuard: null as ReturnType<typeof createLeaveGuard> | null,
  _generation: 0,
  _alive: true,
  _owner: '',
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  _materials: [] as Material[],
  _fileSequence: 0,
  _operation: null as ReturnType<typeof pointApplicationOperation> | null,
  _businessSubscription: null as ReturnType<typeof createBusinessSubscription> | null,
  data: {
    loading: true,
    error: '',
    eligible: false,
    notice: '',
    organizations: [] as AcceptingOrganization[],
    organizationIndex: -1,
    title: '',
    titleLength: 0,
    titleError: '',
    description: '',
    descriptionLength: 0,
    descriptionError: '',
    organizationError: '',
    files: [] as { key: number; name: string; typeLabel: string; status: string }[],
    materialError: '',
    selecting: false,
    submitting: false,
    locked: false,
    unknown: false,
    feedback: '',
    result: null as PointApplication | null,
    resultStatusLabel: '',
    resultStatusTone: 'warning',
  },
  onLoad() {
    this._leaveGuard = createLeaveGuard();
    this._alive = true;
    this._businessSubscription = createBusinessSubscription(() => this._alive);
    this._owner = getCurrentIdentity().id;
    const reset = () => {
      this._leaveGuard?.(false);
      ++this._generation;
      this._operation = null;
      this._materials = [];
      this.setData({
        title: '',
        titleLength: 0,
        titleError: '',
        description: '',
        descriptionLength: 0,
        descriptionError: '',
        organizationError: '',
        files: [],
        materialError: '',
        organizations: [],
        organizationIndex: -1,
        eligible: false,
        locked: false,
        unknown: false,
        submitting: false,
        selecting: false,
        result: null,
        resultStatusLabel: '',
        resultStatusTone: 'warning',
        feedback: '账号或人员绑定已变化，请重新查询申请资格',
      });
      void this.refresh();
    };
    this._offBinding = watchPersonBinding(reset);
    this._off = watchCurrentIdentity(() => {
      if (this._owner !== getCurrentIdentity().id) {
        this._owner = getCurrentIdentity().id;
        reset();
      }
    });
    void this.refresh();
  },
  onShow() {
    void this._businessSubscription?.prepare('POINTS_APPLY');
    this._leaveGuard?.resume();
  },
  onUnload() {
    this._businessSubscription?.dispose();
    this._alive = false;
    ++this._generation;
    this._off?.();
    this._offBinding?.();
    this._materials = [];
    this._operation = null;
  },
  current(generation: number): boolean {
    return this._alive && generation === this._generation;
  },
  async refresh() {
    if (this.data.submitting || this.data.locked) return;
    const selectedId = this.data.organizations[this.data.organizationIndex]?.organizationId;
    const generation = ++this._generation;
    this.setData({
      loading: true,
      error: '',
      eligible: false,
      notice: '',
      organizations: [],
      organizationIndex: -1,
    });
    try {
      const eligibility = await getMyPointsEligibility();
      if (!this.current(generation)) return;
      if (!eligibility.eligible) {
        this.setData({ notice: reasons[eligibility.reason] });
        return;
      }
      const organizations = await listMyPointAcceptingOrganizations();
      if (!this.current(generation)) return;
      const view = pointSubmissionView(eligibility, organizations);
      this.setData({
        eligible: view.showApply,
        organizations: organizations.items,
        organizationIndex: organizations.items.some((o) => o.organizationId === selectedId)
          ? organizations.items.findIndex((o) => o.organizationId === selectedId)
          : organizations.items.length === 1
            ? 0
            : -1,
        notice: organizations.items.length ? '' : reasons.NO_ACCEPTING_ORGANIZATION,
      });
    } catch (error) {
      if (this.current(generation)) this.setData({ error: pointsErrorMessage(error) });
    } finally {
      if (this.current(generation)) this.setData({ loading: false });
    }
  },
  inputTitle(e: WechatMiniprogram.Input) {
    if (!this.data.locked && !this.data.submitting) {
      this.setData({
        title: e.detail.value,
        titleLength: Array.from(e.detail.value).length,
        titleError: '',
        feedback: '',
      });
      this.syncLeaveGuard();
    }
  },
  inputDescription(e: WechatMiniprogram.Input) {
    if (!this.data.locked && !this.data.submitting) {
      this.setData({
        description: e.detail.value,
        descriptionLength: Array.from(e.detail.value).length,
        descriptionError: '',
        feedback: '',
      });
      this.syncLeaveGuard();
    }
  },
  chooseOrganization(e: WechatMiniprogram.PickerChange) {
    if (this.data.locked || this.data.submitting) return;
    const index = Number(e.detail.value);
    if (Number.isInteger(index) && this.data.organizations[index])
      this.setData({ organizationIndex: index, organizationError: '', feedback: '' });
  },
  syncLeaveGuard() {
    this._leaveGuard?.(
      !!this.data.title || !!this.data.description || !!this._materials.length || this.data.unknown,
    );
  },
  syncFiles() {
    this.syncLeaveGuard();
    this.setData({
      files: this._materials.map((f) => ({
        key: f.key,
        name: f.name,
        typeLabel: f.typeLabel,
        status: f.status,
      })),
    });
  },
  async chooseFile() {
    if (
      !this.data.eligible ||
      this.data.loading ||
      this.data.locked ||
      this.data.submitting ||
      this.data.selecting ||
      this._materials.length >= 9
    )
      return;
    const generation = this._generation;
    this.setData({ selecting: true, feedback: '', materialError: '' });
    try {
      const chosen = await chooseMessageFile({ count: 1, type: 'all' });
      if (!this.current(generation)) return;
      const selected = chosen.shift();
      if (!selected) return;
      const format = formats[selected.name.split('.').pop()?.toLowerCase() ?? ''];
      if (!format || !selected.size || selected.size > 10485760)
        throw new Error('请选择10MiB以内的图片、PDF、Word或MP4视频');
      const declaration = fileDeclaration({
        fileName: selected.name,
        sizeBytes: selected.size,
        ...format,
      });
      this._materials.push({
        key: ++this._fileSequence,
        name: selected.name,
        typeLabel: pointMaterialView(format.kind).kindLabel,
        status: '待上传',
        fileId: '',
        operation: pointFileUploadOperation(declaration, selected.path),
      });
      this.syncFiles();
    } catch (error) {
      if (
        this._alive &&
        generation === this._generation &&
        !(error as { errMsg?: string } | null)?.errMsg?.includes('cancel')
      ) {
        const message = error instanceof Error ? error.message : '选择文件失败，请重试';
        this.setData({ feedback: message, materialError: message });
      }
    } finally {
      if (this.current(generation)) this.setData({ selecting: false });
    }
  },
  removeFile(e: WechatMiniprogram.TouchEvent) {
    if (this.data.locked || this.data.submitting || this.data.selecting) return;
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this._materials = this._materials.filter((_, i) => i !== index);
    this.setData({ feedback: '', materialError: '' });
    this.syncFiles();
  },
  openResult() {
    const result = this.data.result;
    if (result)
      void wx.redirectTo({
        url: `/subpkg_user/pages/points-application/index?applicationId=${encodeURIComponent(result.applicationId)}`,
      });
  },
  async submit() {
    if (this.data.submitting || this.data.selecting || this.data.result || this.data.loading)
      return;
    if (!this._operation) {
      if (!this.data.eligible) return;
      const titleError = !this.data.title.trim()
        ? '请填写积分事项'
        : Array.from(this.data.title).length > 120
          ? '积分事项不能超过 120 字'
          : '';
      const descriptionError = !this.data.description.trim()
        ? '请填写申请说明'
        : Array.from(this.data.description).length > 10000
          ? '申请说明不能超过 10000 字'
          : '';
      const organizationError = this.data.organizations[this.data.organizationIndex]
        ? ''
        : '请选择受理组织';
      const materialError = this._materials.length ? '' : '请至少添加一份证明材料';
      if (titleError || descriptionError || organizationError || materialError) {
        this.setData({
          titleError,
          descriptionError,
          organizationError,
          materialError,
          feedback: '请填写标出的必填内容后再提交',
        });
        return;
      }
    }
    const generation = this._generation;
    this.setData({
      submitting: true,
      feedback: '',
      titleError: '',
      descriptionError: '',
      organizationError: '',
      materialError: '',
    });
    if (
      !this._operation &&
      this._businessSubscription &&
      !(await this._businessSubscription.request('POINTS_APPLY'))
    ) {
      if (this._alive) this.setData({ submitting: false });
      return;
    }
    this._leaveGuard?.(true);
    try {
      if (!this._operation) {
        const eligibility = await getMyPointsEligibility();
        if (!this.current(generation)) return;
        if (!eligibility.eligible) {
          this.setData({ eligible: false, notice: reasons[eligibility.reason] });
          return;
        }
        for (const material of this._materials) {
          if (material.fileId) continue;
          material.status = '正在安全上传并登记';
          this.syncFiles();
          const file = await material.operation.upload();
          if (!this.current(generation)) return;
          material.fileId = file.fileId;
          material.status = '材料已就绪';
          this.syncFiles();
        }
        this._operation = pointApplicationOperation({
          title: this.data.title.trim(),
          description: this.data.description.trim(),
          acceptingOrganizationId:
            this.data.organizations[this.data.organizationIndex].organizationId,
          fileIds: this._materials.map((f) => f.fileId),
        });
        this.setData({ locked: true });
      }
      const result = await this._operation.submit();
      if (!this.current(generation)) return;
      this.setData({
        result,
        resultStatusLabel: pointApplicationView(result).statusLabel,
        resultStatusTone: pointStatusTone(result.status),
        unknown: false,
        feedback: '',
      });
      this._leaveGuard?.(false);
    } catch (error) {
      if (!this.current(generation)) return;
      const unknown = this._operation?.state === 'UNKNOWN';
      // A definitive rejected intent can be corrected; the backend retains material ownership/binding checks.
      if (this._operation?.state === 'REJECTED') this._operation = null;
      this.setData({ unknown, locked: unknown, feedback: pointsErrorMessage(error) });
      for (const material of this._materials)
        if (!material.fileId) material.status = '尚未确认，可重试或移除';
      this.syncFiles();
    } finally {
      if (this.current(generation)) this.setData({ submitting: false });
    }
  },
});
