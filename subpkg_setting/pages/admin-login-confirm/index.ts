import { ensureLogin, getToken } from '../../../actions/auth';
import { appStore } from '../../../stores/index';
import { getUserId } from '../../../stores/helper';
import { refreshAuth, waitForAuthStable } from '../../../utils/auth-session';
import { isAuthError, isHttpError } from '../../../utils/error';
import { wxNavigateBack, wxReLaunch } from '../../../utils/wx-promise';
import { ROUTES } from '../../../utils/routes';
import { showSuccessToast, showErrorToast } from '../../../utils/notify';
import {
  parseAdminLoginScene,
  requestAdminQrLogin,
  type AdminQrLoginScan,
  type AdminQrLoginStatus,
} from '../../services/admin-qr-login';

const statusCopy: Record<AdminQrLoginStatus, [string, string]> = {
  PENDING: ['等待扫码绑定', '请重新加载登录请求。'],
  SCANNED: ['确认登录管理后台', '请确认此二维码来自你正在操作的电脑。'],
  CONFIRMED: ['登录已确认', '请返回电脑完成登录。'],
  CONSUMED: ['电脑已完成登录', '你可以关闭此页面。'],
  EXPIRED: ['二维码已过期', '请在电脑上刷新二维码后重新扫码。'],
  REJECTED: ['登录请求已拒绝', '如需登录，请在电脑上重新生成二维码。'],
  CANCELLED: ['登录请求已取消', '请在电脑上重新生成二维码后扫码。'],
};

const problemCopy: Record<string, [string, string]> = {
  '/problems/admin-access-denied': ['暂无后台访问权限', '当前账号无法登录管理后台。'],
  '/problems/qr-login-invalid-scene': ['二维码不可用', '请在电脑上刷新二维码后重新扫码。'],
  '/problems/qr-login-subject-conflict': [
    '二维码已被其他账号扫描',
    '请在电脑上刷新二维码，使用当前账号重新扫码。',
  ],
  '/problems/qr-login-session-expired': statusCopy.EXPIRED,
  '/problems/qr-login-session-rejected': statusCopy.REJECTED,
  '/problems/qr-login-session-cancelled': statusCopy.CANCELLED,
  '/problems/qr-login-session-already-consumed': statusCopy.CONSUMED,
};

/** Device-local civil time; avoid locale-generated timezone suffixes. */
export function formatLoginExpiry(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  const clock = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  const sameYear = date.getFullYear() === today.getFullYear();
  const sameDay =
    sameYear && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  if (sameDay) return `今天 ${clock}`;
  const year = sameYear ? '' : `${date.getFullYear().toString()}年`;
  return `${year}${(date.getMonth() + 1).toString()}月${date.getDate().toString()}日 ${clock}`;
}

export function formatLoginRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes.toString()} 分 ${rest.toString()} 秒` : `${rest.toString()} 秒`;
}

Page({
  data: {
    title: '正在加载登录请求',
    description: '请稍候',
    expiresText: '',
    remainingText: '',
    loading: false,
    canAct: false,
    canRetry: false,
    status: '',
  },
  _scene: '',
  _subject: '',
  _generation: 0,
  _visible: false,
  _disposed: false,
  _leaving: false,
  _expiresAt: 0,
  _retryAt: 0,
  _authRecoveries: 0,
  _timer: null as ReturnType<typeof setInterval> | null,
  _unwatch: null as (() => void) | null,

  onLoad(options: { scene?: string }) {
    this._scene = parseAdminLoginScene(options.scene) ?? '';
    if (!this._scene) {
      this.setData({ title: '二维码不可用', description: '请从电脑上的管理后台登录二维码进入。' });
      return;
    }
    let previous = getUserId();
    this._unwatch = appStore.watch('userInfo', (user) => {
      if (user.id === previous) return;
      previous = user.id;
      this._generation++;
      this._subject = '';
      this._expiresAt = 0;
      this.setData({
        title: '正在加载登录请求',
        description: '账号已变化，正在重新核对。',
        canAct: false,
        loading: false,
        status: '',
        expiresText: '',
        remainingText: '',
      });
      if (this._visible) void this._request('scan');
    });
  },

  onShow() {
    if (this._disposed || this._leaving) return;
    this._visible = true;
    if (!this._scene) return;
    this._tick();
    this._timer = setInterval(() => {
      this._tick();
    }, 1000);
    // Scan also reconciles unknown outcomes and Web cancellation after returning.
    if (!this.data.loading) void this._request('scan');
  },

  onHide() {
    this._visible = false;
    this._stopTimer();
  },

  onUnload() {
    this._disposed = true;
    this._generation++;
    this._stopTimer();
    this._unwatch?.();
    this._scene = '';
    this._subject = '';
  },

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  },

  _tick() {
    if (this._disposed || this._leaving) return;
    const remaining = Math.max(0, Math.ceil((this._expiresAt - Date.now()) / 1000));
    const cooling = Date.now() < this._retryAt;
    const active = ['PENDING', 'SCANNED', 'CONFIRMED'].includes(this.data.status);
    this.setData({
      remainingText: active && this._expiresAt ? formatLoginRemaining(remaining) : '',
      canAct: this.data.status === 'SCANNED' && remaining > 0 && !this.data.loading && !cooling,
      canRetry: this.data.canRetry && !cooling,
    });
    if (active && this._expiresAt && !remaining) {
      this.setData({
        title: statusCopy.EXPIRED[0],
        description: statusCopy.EXPIRED[1],
        canAct: false,
      });
    }
    // A rate-limit cooldown permits only a user-triggered re-scan.
    if (this._retryAt && !cooling) {
      this._retryAt = 0;
      this.setData({ canRetry: true });
    }
  },

  _present(result: AdminQrLoginScan) {
    this._authRecoveries = 0;
    const { session } = result;
    const expiresAt = Date.parse(session.expiresAt);
    this._expiresAt = expiresAt;
    const [title, description] = statusCopy[session.status];
    this.setData({
      status: session.status,
      title,
      description,
      expiresText: formatLoginExpiry(expiresAt),
      loading: false,
      canRetry: session.status === 'PENDING',
    });
    this._tick();
  },

  _isCurrent(generation: number) {
    return !this._disposed && !this._leaving && generation === this._generation;
  },

  async _request(operation: 'scan' | 'confirm' | 'reject') {
    if (
      !this._scene ||
      this._disposed ||
      this._leaving ||
      this.data.loading ||
      Date.now() < this._retryAt
    )
      return;
    if (operation !== 'scan' && (!this.data.canAct || this._subject !== getUserId())) return;
    const generation = ++this._generation;
    this.setData({ loading: true, canAct: false, canRetry: false });
    try {
      await waitForAuthStable();
      await ensureLogin();
      if (!this._isCurrent(generation)) return;
      const subject = getUserId();
      if (!subject) throw new Error('Missing Mini Program subject');
      if (operation !== 'scan' && subject !== this._subject) {
        this.setData({ loading: false });
        await this._request('scan');
        return;
      }
      const result = await requestAdminQrLogin(operation, this._scene);
      if (!this._isCurrent(generation) || subject !== getUserId()) return;
      this._subject = subject;
      this._present(result);
      if (operation === 'confirm' && ['CONFIRMED', 'CONSUMED'].includes(result.session.status)) {
        showSuccessToast('登录已确认，请返回电脑');
        await this._exit();
      } else if (operation === 'reject' && result.session.status === 'REJECTED') {
        showSuccessToast('已取消本次登录');
        await this._exit();
      }
    } catch (error) {
      if (!this._isCurrent(generation)) return;
      this._subject = '';
      this.setData({ loading: false, canAct: false, status: '' });
      if (isAuthError(error)) {
        this.setData({
          title: '需要重新认证',
          description: '身份恢复后将重新加载请求，请再次确认。',
          canRetry: true,
        });
        if (this._authRecoveries >= 1) return;
        this._authRecoveries++;
        try {
          await refreshAuth(getToken() ?? undefined);
          if (this._isCurrent(generation) && this._visible) await this._request('scan');
        } catch {
          // Keep the scene in page memory for an explicit retry; never replay confirmation.
        }
        return;
      }
      const copy = isHttpError(error) ? problemCopy[error.problemType ?? ''] : undefined;
      if (copy) {
        this.setData({ title: copy[0], description: copy[1], canRetry: false });
      } else if (isHttpError(error) && error.statusCode === 429) {
        this._retryAt = Date.now() + (error.retryAfterMs ?? 5000);
        this.setData({
          title: '操作过于频繁',
          description: '请稍候，再重新加载登录请求。',
          canRetry: false,
        });
      } else {
        this.setData({
          title: '暂时无法确认登录状态',
          description: '请重新加载请求，核对最新状态后再操作。',
          canRetry: true,
        });
      }
    }
  },

  async _exit() {
    if (this._leaving || this._disposed) return;
    this._leaving = true;
    this._generation++;
    this._stopTimer();
    this.setData({ canAct: false, canRetry: false });
    try {
      if (getCurrentPages().length > 1) {
        try {
          await wxNavigateBack();
          return;
        } catch {
          // An external scan can have no surviving previous Page.
        }
      }
      await wxReLaunch({ url: ROUTES.HOME });
    } catch {
      this._leaving = false;
      showErrorToast('返回失败，请稍后再试');
    }
  },

  onClose() {
    void this._exit();
  },

  onConfirm() {
    void this._request('confirm');
  },
  onReject() {
    void this._request('reject');
  },
  onRetry() {
    if (this.data.canRetry) {
      this._authRecoveries = 0;
      void this._request('scan');
    }
  },
});
