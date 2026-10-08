import definePage from '../../../utils/definePage';
import * as action from '../../actions/registration';
import type {
  RegistrationAnswers,
  RegistrationField,
  RegistrationForm,
  MyRegistration,
} from '../../types/registration';
import { wxShowModal } from '../../../utils/wx-promise';
import { isHttpError } from '../../../utils/error';

const initialAnswers: RegistrationAnswers = {};
const initialFieldCandidates: Record<string, string[]> = {};

interface AnswerDisplay {
  key: string;
  label: string;
  value: string;
}

interface RegistrationValidationLike extends Error {
  fieldErrors?: Record<string, string>;
}

function cloneAnswers(answers: RegistrationAnswers): RegistrationAnswers {
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  );
}

function answersEqual(
  fields: RegistrationField[],
  left: RegistrationAnswers,
  right: RegistrationAnswers,
): boolean {
  return fields.every((field) => {
    const leftValue = left[field.key];
    const rightValue = right[field.key];
    const leftBlank =
      leftValue == null || leftValue === '' || (Array.isArray(leftValue) && leftValue.length === 0);
    const rightBlank =
      rightValue == null ||
      rightValue === '' ||
      (Array.isArray(rightValue) && rightValue.length === 0);
    if (leftBlank || rightBlank) return leftBlank === rightBlank;
    if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
      return [...leftValue].sort().join('\u0000') === [...rightValue].sort().join('\u0000');
    }
    return leftValue === rightValue;
  });
}

function answerDisplays(
  fields: RegistrationField[],
  answers: RegistrationAnswers,
): AnswerDisplay[] {
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  return Object.entries(answers).flatMap(([key, value]) => {
    if (value == null) return [];
    const field = fieldByKey.get(key);
    const optionLabels = new Map(field?.options?.map((option) => [option.value, option.label]));
    const values = Array.isArray(value) ? value : [value];
    return [
      {
        key,
        label: field?.label ?? key,
        value: values.map((item) => optionLabels.get(item) ?? item).join('、'),
      },
    ];
  });
}

definePage({
  _version: 0,
  _unloaded: false,
  _baselineAnswers: {},
  data: {
    activityId: '',
    loading: true,
    busy: false,
    error: '',
    message: '',
    unknown: false,
    conflict: false,
    info: null as RegistrationForm | null,
    mine: null as MyRegistration | null,
    fields: [] as RegistrationField[],
    fieldCandidates: initialFieldCandidates,
    hasReusableCandidates: false,
    rememberReusableFields: false,
    fieldErrors: {},
    validationSummary: '',
    answerDisplays: [] as AnswerDisplay[],
    answers: initialAnswers,
    isDirty: false,
    canSubmit: false,
    statusLabel: '',
  },
  onLoad(options: { activityId?: string }) {
    this.setData({ activityId: options.activityId ?? '' });
  },
  onShow() {
    if (!this.data.busy) void this.reload();
  },
  reload() {
    return this._reloadRegistration();
  },
  isAlive(): boolean {
    return !this._unloaded;
  },
  onUnload() {
    this._unloaded = true;
    this._version++;
  },
  async _reloadRegistration(preservedAnswers?: RegistrationAnswers, conflict = false) {
    const version = ++this._version;
    this.setData({ loading: true, error: '', canSubmit: false });
    if (!this.data.activityId) {
      this.setData({ loading: false, error: '缺少活动信息，请返回活动列表' });
      return;
    }
    try {
      const [formResult, mineResult] = await action.loadRegistration(this.data.activityId);
      if (!this.isAlive() || version !== this._version) return;
      const info = formResult.status === 'fulfilled' ? formResult.value : null;
      if (mineResult.status === 'rejected') throw new Error('本人报名记录未能确认，请重试');
      const mine = mineResult.value;
      const fields = info?.fields ?? [];
      const candidateState = info
        ? await action.readRegistrationCandidates(fields)
        : { byFieldKey: {}, hasProfile: false };
      if (!this.isAlive() || version !== this._version) return;
      const baselineAnswers = cloneAnswers(mine?.answers ?? {});
      const answers = cloneAnswers(preservedAnswers ?? baselineAnswers);
      this._baselineAnswers = baselineAnswers;
      this.setData({
        info,
        mine,
        answers,
        isDirty: !answersEqual(fields, answers, baselineAnswers),
        unknown: false,
        conflict,
        fields,
        fieldCandidates: candidateState.byFieldKey,
        hasReusableCandidates: Object.values(candidateState.byFieldKey).some(
          (values) => values.length > 0,
        ),
        rememberReusableFields: candidateState.hasProfile || this.data.rememberReusableFields,
        answerDisplays: answerDisplays(fields, mine?.answers ?? {}),
        canSubmit:
          Boolean(info) &&
          (mine?.status === 'SUBMITTED' ? mine.canModify : info?.availability === 'OPEN'),
        statusLabel: mine
          ? ({ SUBMITTED: '已提交', CANCELLED: '已取消' } as const)[mine.status]
          : '尚未提交',
        error: !info && !mine ? '报名表暂不可读取，请重试或返回活动详情' : '',
      });
      this.syncFields();
    } catch (e) {
      if (this.isAlive() && version === this._version)
        this.setData({ error: e instanceof Error ? e.message : '加载失败', unknown: true });
    } finally {
      if (this.isAlive() && version === this._version) this.setData({ loading: false });
    }
  },
  syncFields() {
    this.setData({
      fields: this.data.fields.map((f) => {
        const answer = this.data.answers[f.key];
        return {
          ...f,
          options: f.options?.map((o) => ({
            ...o,
            checked: Array.isArray(answer) && answer.includes(o.value),
          })),
        };
      }),
    });
  },
  onInput(e: WechatMiniprogram.CustomEvent<{ value: string | string[] }>) {
    const key: unknown = e.currentTarget.dataset.key;
    if (typeof key !== 'string' || !this.data.canSubmit || this.data.busy) return;
    const field = this.data.fields.find((f) => f.key === key);
    if (!field) return;
    this.applyAnswer(key, e.detail.value);
  },
  onUseCandidate(e: WechatMiniprogram.TouchEvent) {
    const { key, value } = e.currentTarget.dataset as { key?: string; value?: string };
    if (!key || typeof value !== 'string' || !this.data.canSubmit || this.data.busy) return;
    this.applyAnswer(key, value);
  },
  applyAnswer(key: string, value: string | string[]) {
    const answers = { ...this.data.answers, [key]: value };
    this.setData({
      answers,
      isDirty: !answersEqual(this.data.fields, answers, this._baselineAnswers),
      fieldErrors: { ...this.data.fieldErrors, [key]: '' },
      validationSummary: '',
      message: '',
    });
    this.syncFields();
  },
  async onRememberChange(e: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
    const enabled = e.detail.value;
    this.setData({ rememberReusableFields: enabled });
    if (!enabled) {
      await action.clearRegistrationCandidates();
      if (this.isAlive()) {
        this.setData({
          fieldCandidates: {},
          hasReusableCandidates: false,
          message: '已清除本机常用报名信息',
        });
      }
      return;
    }
    if (this.data.info && this.data.mine?.status === 'SUBMITTED') {
      await action.saveRegistrationCandidates(this.data.info.fields, this.data.mine.answers);
      const candidateState = await action.readRegistrationCandidates(this.data.info.fields);
      if (this.isAlive()) {
        this.setData({
          fieldCandidates: candidateState.byFieldKey,
          hasReusableCandidates: Object.values(candidateState.byFieldKey).some(
            (values) => values.length > 0,
          ),
          message: '已保存为本机常用报名信息',
        });
      }
    }
  },
  scrollToFirstInvalidField(fieldErrors: Record<string, string>) {
    const index = this.data.fields.findIndex((field) => Boolean(fieldErrors[field.key]));
    if (index < 0) return;
    void wx.pageScrollTo({
      selector: `#registration-field-${String(index)}`,
      offsetTop: 16,
      duration: 240,
    });
  },
  async onSubmit() {
    if (this.data.busy || this.data.loading || !this.data.canSubmit || this.data.unknown) return;
    if (this.data.mine?.status === 'SUBMITTED' && !this.data.isDirty) return;
    this.setData({
      busy: true,
      error: '',
      message: '',
      validationSummary: '',
      fieldErrors: {},
    });
    const attemptedAnswers = Object.fromEntries(
      Object.entries(this.data.answers).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ]),
    );
    try {
      if (!this.data.info) return;
      await action.submitRegistration(
        this.data.activityId,
        this.data.info,
        this.data.answers,
        this.data.mine,
        this.data.rememberReusableFields,
      );
      if (this.isAlive()) {
        this.setData({ message: '信息已提交。这不代表官方录取或完成外部步骤。' });
        await this.reload();
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'RegistrationValidationError') {
        if (this.isAlive()) {
          const validationError = e as RegistrationValidationLike;
          const fieldErrors = validationError.fieldErrors ?? {};
          this.setData({ validationSummary: e.message, fieldErrors });
          this.scrollToFirstInvalidField(fieldErrors);
        }
      } else if (isHttpError(e) && e.statusCode === 412) {
        if (this.isAlive()) {
          this.setData({
            message: '报名记录已在其他设备更新。已保留本次填写，请核对服务端最新答案后再提交。',
          });
          await this._reloadRegistration(attemptedAnswers, true);
        }
      } else await this.confirmOutcome(e, attemptedAnswers);
    } finally {
      if (this.isAlive()) this.setData({ busy: false });
    }
  },
  async onCancel() {
    if (
      this.data.busy ||
      this.data.loading ||
      this.data.unknown ||
      this.data.mine?.status !== 'SUBMITTED' ||
      !this.data.mine.canCancel
    )
      return;
    this.setData({ busy: true, error: '', message: '' });
    let requested = false;
    try {
      const result = await wxShowModal({
        title: '取消报名提交',
        content:
          '取消将释放平台收表名额。以后重新提交仍会重新检查活动状态、报名窗口和名额，确认取消吗？',
      });
      if (!result.confirm || !this.isAlive()) return;
      requested = true;
      await action.cancelRegistration(this.data.activityId, this.data.mine);
      if (this.isAlive()) {
        this.setData({ message: '已取消报名提交' });
        await this.reload();
      }
    } catch (e) {
      if (requested) await this.confirmOutcome(e);
      else if (this.isAlive()) this.setData({ error: '确认窗口未能打开，请重试' });
    } finally {
      if (this.isAlive()) this.setData({ busy: false });
    }
  },
  async confirmOutcome(error: unknown, preservedAnswers?: RegistrationAnswers) {
    if (!this.isAlive()) return;
    const message = error instanceof Error ? error.message : '请求结果未确认';
    try {
      const mine = await action.readMyRegistration(this.data.activityId);
      if (!this.isAlive()) return;
      this.setData({ mine, message: `${message}。已重新查询本人记录，请核对下方状态与答案。` });
      await this._reloadRegistration(preservedAnswers);
    } catch {
      if (this.isAlive())
        this.setData({
          unknown: true,
          canSubmit: false,
          error: '操作结果暂未确认，请点击重新查询；确认前请勿重复提交。',
        });
    }
  },
  async onActivity() {
    if (this.data.isDirty) {
      const result = await wxShowModal({
        title: '修改尚未保存',
        content: '返回活动安排会丢失本页尚未提交或保存的内容，仍要返回吗？',
        confirmText: '仍要返回',
        cancelText: '继续填写',
      });
      if (!result.confirm || !this.isAlive()) return;
    }

    const pages = getCurrentPages();
    const previousPage = pages.length > 1 ? pages[pages.length - 2] : undefined;
    if (previousPage?.route === 'subpkg_activity/pages/detail/detail') {
      void wx.navigateBack({ delta: 1 });
      return;
    }

    void wx.redirectTo({
      url: `/subpkg_activity/pages/detail/detail?activityId=${encodeURIComponent(this.data.activityId)}`,
    });
  },
});
