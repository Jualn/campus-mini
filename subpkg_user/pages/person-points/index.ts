import { isReadAccessError } from '../../../utils/error';
import definePage from '../../../utils/definePage';
import { getMyPersonBinding, watchPersonBinding } from '../../../services/person-binding';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import {
  getMyPointSummary,
  listMyPointLedger,
  pointsErrorMessage,
  pointId,
  type PointSummary,
  type PointLedger,
} from '../../services/points';
import { pointTimeText } from '../../services/points-state';

type SummaryView = PointSummary & { evaluatedAtText: string };
type LedgerRow = PointLedger & {
  kindLabel: string;
  deltaText: string;
  direction: 'credit' | 'debit';
  createdAtText: string;
};

function ledgerRow(item: PointLedger): LedgerRow {
  return {
    ...item,
    kindLabel:
      item.kind === 'GRANT'
        ? '原审核核发'
        : item.kind === 'CORRECTION_GRANT'
          ? '纠错核发'
          : '积分冲正',
    deltaText: `${item.pointsDelta > 0 ? '+' : ''}${String(item.pointsDelta)}`,
    direction: item.pointsDelta >= 0 ? 'credit' : 'debit',
    createdAtText: pointTimeText(item.createdAt),
  };
}

definePage({
  _generation: 0,
  _visible: false,
  _owner: '',
  _applicationId: '',
  _validQuery: true,
  _off: null as (() => void) | null,
  _offBinding: null as (() => void) | null,
  data: {
    loading: false,
    error: '',
    moreError: '',
    state: 'loading',
    summary: null as SummaryView | null,
    ledger: [] as LedgerRow[],
    page: 0,
    hasMore: false,
    applicationId: '',
  },
  onLoad(query: Record<string, string | undefined> = {}) {
    if (query.applicationId !== undefined) {
      try {
        this._applicationId = pointId(query.applicationId);
        this.setData({ applicationId: this._applicationId });
      } catch {
        this.setData({ state: 'error', error: '申请标识无效，请从申请详情重新进入' });
        this._validQuery = false;
      }
    }
    this._owner = getCurrentIdentity().id;
    const reset = () => {
      ++this._generation;
      this.setData({
        summary: null,
        ledger: [],
        hasMore: false,
        state: 'loading',
        error: '',
        moreError: '',
      });
      if (this._visible) void this.refresh();
    };
    this._offBinding = watchPersonBinding(reset);
    this._off = watchCurrentIdentity(() => {
      if (this._owner !== getCurrentIdentity().id) {
        this._owner = getCurrentIdentity().id;
        reset();
      }
    });
  },
  onShow() {
    this._visible = true;
    void this.refresh();
  },
  onHide() {
    this._visible = false;
    ++this._generation;
    this.setData({ summary: null, ledger: [], state: 'loading' });
  },
  onUnload() {
    this._visible = false;
    ++this._generation;
    this._off?.();
    this._offBinding?.();
  },
  async refresh() {
    await this.load(1);
  },
  async more() {
    if (!this.data.loading && this.data.hasMore) await this.load(Number(this.data.page) + 1);
  },
  async onPullDownRefresh() {
    try {
      await this.refresh();
    } finally {
      void wx.stopPullDownRefresh();
    }
  },
  async load(page: number) {
    if (!this._validQuery) return;
    const generation = ++this._generation;
    this.setData({
      loading: true,
      ...(page === 1 ? { error: '', moreError: '' } : { moreError: '' }),
      ...(page === 1 && !this.data.ledger.length && !this.data.summary ? { state: 'loading' } : {}),
    });
    try {
      const binding = await getMyPersonBinding();
      if (generation !== this._generation) return;
      if (binding.state === 'UNBOUND' || binding.personStatus !== 'ACTIVE') {
        this.setData({
          state: binding.state === 'UNBOUND' ? 'unbound' : 'unavailable',
          summary: null,
          ledger: [],
        });
        return;
      }
      const [summary, ledger] = await Promise.all([
        this._applicationId ? Promise.resolve(null) : getMyPointSummary(),
        listMyPointLedger({
          page,
          pageSize: 20,
          ...(this._applicationId ? { applicationId: this._applicationId } : {}),
        }),
      ]);
      if (generation !== this._generation) return;
      const rows = ledger.items.map(ledgerRow);
      this.setData({
        state: 'bound',
        summary: summary
          ? { ...summary, evaluatedAtText: pointTimeText(summary.evaluatedAt) }
          : null,
        ledger: page === 1 ? rows : [...this.data.ledger, ...rows],
        page,
        hasMore: page * ledger.pageSize < ledger.totalItems,
      });
    } catch (error) {
      if (generation === this._generation)
        this.setData({
          state: this.data.ledger.length || this.data.summary ? 'bound' : 'error',
          ...(page === 1
            ? { error: pointsErrorMessage(error) }
            : { moreError: pointsErrorMessage(error) }),
          ...(isReadAccessError(error)
            ? {
                summary: null,
                ledger: [],
                hasMore: false,
                state: 'error',
                error: pointsErrorMessage(error),
              }
            : {}),
        });
    } finally {
      if (generation === this._generation) this.setData({ loading: false });
    }
  },
});
