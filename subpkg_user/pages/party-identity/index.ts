import definePage from '../../../utils/definePage';
import { formatTime, TimeStyle } from '../../../utils/time-util';
import { watchPersonBinding } from '../../../services/person-binding';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import {
  listMyPartyIdentityApplications,
  qualificationError,
  getMyPartyIdentity,
  type MyPartyIdentity,
  type PartyIdentityApplication,
} from '../../services/people-qualification';
import {
  pendingPartyApplication,
  submitPartyApplication,
  PartyBindingReconciliationError,
} from '../../services/party-identity-operation';

definePage({
  _generation: 0,
  _submitRevision: 0,
  _active: false,
  _identityGeneration: 0,
  _identityTimer: null as number | null,
  _expiresAt: null as number | null,
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  data: {
    userId: '',
    mentorRevision: 0,
    realName: '',
    studentNumber: '',
    loading: false,
    submitting: false,
    unresolved: false,
    error: '',
    message: '',
    items: [] as (PartyIdentityApplication & { dateText: string })[],
    hasMore: false,
    page: 0,
    identity: null as MyPartyIdentity | null,
    identityLoading: false,
    identityError: '',
    identityLabel: '',
    identityDates: '',
    stageLabel: '',
    methodLabel: '',
  },
  onLoad() {
    this._offBinding = watchPersonBinding(() => {
      this.clearIdentity();
      if (this._active) void this.refreshIdentity();
    });
    this._off = watchCurrentIdentity(() => {
      if (this.data.userId === getCurrentIdentity().id) return;
      ++this._generation;
      ++this._submitRevision;
      this.clearIdentity();
      this.setData({
        userId: getCurrentIdentity().id,
        realName: '',
        studentNumber: '',
        items: [],
        error: '',
        message: '',
        unresolved: false,
        submitting: false,
      });
      if (this._active) void this.refresh();
    });
  },
  onShow() {
    this._active = true;
    const pending = pendingPartyApplication();
    this.setData({
      userId: getCurrentIdentity().id,
      unresolved: !!pending,
      ...(pending ? pending.body : {}),
    });
    void this.refresh();
  },
  onHide() {
    this._active = false;
    ++this._generation;
    this.clearIdentity();
  },
  onUnload() {
    this._active = false;
    ++this._generation;
    ++this._submitRevision;
    this.clearIdentity();
    this._off?.();
    this._offBinding?.();
  },
  onInput(event: WechatMiniprogram.Input) {
    if (this.data.submitting || pendingPartyApplication()) return;
    const field = event.currentTarget.dataset.field as string;
    if (['realName', 'studentNumber'].includes(field))
      this.setData({ [field]: event.detail.value });
  },
  async refresh() {
    this.setData({ mentorRevision: this.data.mentorRevision + 1 });
    await Promise.all([this.load(1), this.refreshIdentity()]);
  },
  clearIdentity() {
    ++this._identityGeneration;
    if (this._identityTimer !== null) clearTimeout(this._identityTimer);
    this._identityTimer = null;
    this._expiresAt = null;
    this.setData({
      identity: null,
      identityLabel: '',
      identityDates: '',
      stageLabel: '',
      methodLabel: '',
      identityError: '',
      identityLoading: false,
    });
  },
  async refreshIdentity() {
    this.clearIdentity();
    const generation = this._identityGeneration,
      started = Date.now();
    this.setData({ identityLoading: true });
    try {
      const identity = await getMyPartyIdentity();
      if (generation !== this._identityGeneration) return;
      const labels = {
        UNBOUND: '还未关联个人档案',
        PERSON_UNAVAILABLE: '个人档案暂不可用，请联系管理员',
        NOT_YET_VALID: '身份记录尚未生效',
        UNKNOWN: '身份尚未核实',
        DISPUTED: '身份存在争议，请联系组织管理员',
        NONE: '当前无党建身份',
        ACTIVE: '当前有效党建身份',
        EXPIRED: '身份记录已到期',
        INACTIVE: '身份记录已停用',
        REVOKED: '身份记录已撤销',
      };
      const stages = {
        PARTY_ACTIVIST: '入党积极分子',
        PARTY_DEVELOPMENT_CANDIDATE: '发展对象',
        PROBATIONARY_PARTY_MEMBER: '预备党员',
        FULL_PARTY_MEMBER: '正式党员',
      };
      const until =
        identity.effectiveStatus === 'NOT_YET_VALID'
          ? identity.currentRecord?.validFrom
          : identity.currentRecord?.validUntil;
      if (['ACTIVE', 'NOT_YET_VALID'].includes(identity.effectiveStatus) && until) {
        this._expiresAt = Math.min(
          Date.parse(until),
          started + Date.parse(until) - Date.parse(identity.evaluatedAt),
        );
        if (this._expiresAt <= Date.now()) {
          this.setData({ identityError: '本次身份有效期已结束，请重新查询当前状态' });
          return;
        }
      }
      this.setData({
        identity,
        identityLabel: labels[identity.effectiveStatus],
        identityDates: identity.currentRecord
          ? `${formatTime(identity.currentRecord.validFrom, TimeStyle.SHORT_YMDHM)} 至 ${identity.currentRecord.validUntil ? formatTime(identity.currentRecord.validUntil, TimeStyle.SHORT_YMDHM) : '无固定截止时间'}`
          : '',
        stageLabel: identity.currentRecord ? stages[identity.currentRecord.stageId] : '',
        methodLabel:
          identity.verificationMethod === 'ROSTER_IMPORT'
            ? '名单核实'
            : identity.verificationMethod === 'ADMIN_MANUAL'
              ? '人工核实'
              : identity.verificationMethod
                ? '其他核实方式'
                : '',
      });
      if (['ACTIVE', 'NOT_YET_VALID'].includes(identity.effectiveStatus) && until) {
        this.scheduleIdentityExpiry();
      }
    } catch (error) {
      if (generation === this._identityGeneration)
        this.setData({ identityError: qualificationError(error) });
    } finally {
      if (generation === this._identityGeneration) this.setData({ identityLoading: false });
    }
  },
  scheduleIdentityExpiry() {
    if (this._expiresAt === null) return;
    const delay = this._expiresAt - Date.now();
    if (delay <= 0) {
      // Hide the old projection immediately; only the server may confirm the next status.
      this.clearIdentity();
      if (this._active) void this.refreshIdentity();
      return;
    }
    this._identityTimer = setTimeout(
      () => {
        this._identityTimer = null;
        this.scheduleIdentityExpiry();
      },
      Math.min(delay, 2147483647),
    );
  },
  async more() {
    if (!this.data.loading && this.data.hasMore) await this.load(this.data.page + 1);
  },
  async load(page: number) {
    const generation = ++this._generation;
    this.setData({
      loading: true,
      error: '',
      ...(page === 1 ? { items: [], hasMore: false } : {}),
    });
    try {
      const result = await listMyPartyIdentityApplications(page);
      if (generation !== this._generation) return;
      const rows = result.items.map((item) => ({
        ...item,
        dateText: formatTime(item.decidedAt, TimeStyle.FULL),
      }));
      const items = page === 1 ? rows : [...this.data.items, ...rows];
      this.setData({ items, page, hasMore: items.length < result.totalItems });
    } catch (error) {
      if (generation === this._generation) this.setData({ error: qualificationError(error) });
    } finally {
      if (generation === this._generation)
        this.setData({ loading: false, unresolved: !!pendingPartyApplication() });
    }
  },
  async submit() {
    if (this.data.submitting || this.data.loading) return;
    const pending = pendingPartyApplication();
    const body = pending?.body ?? {
      realName: this.data.realName.trim(),
      studentNumber: this.data.studentNumber.trim(),
    };
    if (!body.realName || !body.studentNumber) {
      this.setData({ message: '请填写姓名和学号' });
      return;
    }
    const generation = ++this._submitRevision;
    this.setData({ submitting: true, message: '', error: '' });
    try {
      await submitPartyApplication(body);
      if (generation !== this._submitRevision) return;
      this.setData({
        realName: '',
        studentNumber: '',
        message: '个人档案已关联。',
      });
    } catch (error) {
      if (generation !== this._submitRevision) return;
      this.setData({
        message:
          error instanceof PartyBindingReconciliationError
            ? error.message
            : qualificationError(error),
      });
    } finally {
      if (generation === this._submitRevision) {
        this.setData({ submitting: false, unresolved: !!pendingPartyApplication() });
        if (this._active) await this.refresh();
      }
    }
  },
});
