import {
  wxGetAccountInfoSync,
  wxNavigateBack,
  wxNavigateTo,
  wxSetClipboardData,
  showConfirm,
} from '../../../utils/wx-promise';
import * as authAction from '../../../actions/auth';
import * as notificationPreferenceAction from '../../actions/notification-preferences';
import { NOTIFICATION_CATEGORIES } from '../../services/notification-preferences';
import type {
  NotificationPreferenceRow,
  NotificationPreferenceSnapshot,
} from '../../services/notification-preferences';
import { invalidateBusinessSubscriptions } from '../../../services/business-subscriptions';
import type { NotificationCategory } from '../../../types/api';
import { eventBus, EVENTS } from '../../../utils/event-bus';
import { getUserId } from '../../../stores/helper';
import { notifyToast, showErrorToast } from '../../../utils/notify';

interface NotificationGroup {
  category: NotificationCategory;
  label: string;
  rows: NotificationPreferenceRow[];
}

Page({
  _active: true,
  _unloaded: false,
  _hasShown: false,
  _skipShowRefresh: false,
  _ownerUserId: null as string | null,
  _session: 0,
  _loadGeneration: 0,
  _settingGeneration: 0,
  _sessionListener: null as (() => void) | null,

  data: {
    wxNumber: 'chan50813',
    version: '1.0.0',
    groups: [] as NotificationGroup[],
    preferenceState: 'loading',
    preferenceSavingKey: '',
    subscriptionSettingsPending: false,
    wechatMainSwitch: 'unknown',
    rememberedRejection: false,
  },

  onLoad() {
    this._ownerUserId = getUserId();
    this._session = notificationPreferenceAction.getNotificationSession();
    this._sessionListener = () => {
      this._onSessionChanged();
    };
    eventBus.on(EVENTS.LOGOUT, this._sessionListener);
    eventBus.on(EVENTS.LOGIN_SUCCESS, this._sessionListener);
    this.setData({ version: wxGetAccountInfoSync().miniProgram.version || '开发版' });
    void this._loadNotificationArea();
  },
  onShow() {
    this._active = true;
    if (
      this._ownerUserId !== getUserId() ||
      this._session !== notificationPreferenceAction.getNotificationSession()
    ) {
      this._onSessionChanged();
    } else if (this._hasShown && !this._skipShowRefresh && !this.data.subscriptionSettingsPending) {
      void this._loadNotificationArea();
    }
    this._hasShown = true;
    this._skipShowRefresh = false;
    this._readWechatSettings();
  },
  onHide() {
    this._active = false;
  },
  onUnload() {
    this._unloaded = true;
    this._active = false;
    if (this._sessionListener) {
      eventBus.off(EVENTS.LOGOUT, this._sessionListener);
      eventBus.off(EVENTS.LOGIN_SUCCESS, this._sessionListener);
    }
  },
  _isCurrent(session: number) {
    return (
      !this._unloaded &&
      session === this._session &&
      session === notificationPreferenceAction.getNotificationSession() &&
      this._ownerUserId === getUserId()
    );
  },
  _onSessionChanged() {
    if (this._unloaded) return;
    this._session = notificationPreferenceAction.getNotificationSession();
    this._ownerUserId = getUserId();
    this._loadGeneration++;
    this._settingGeneration++;
    this._skipShowRefresh = false;
    this.setData({
      groups: [],
      preferenceState: 'loading',
      preferenceSavingKey: '',
      subscriptionSettingsPending: false,
      wechatMainSwitch: 'unknown',
    });
    if (this._active) {
      void this._loadNotificationArea();
      this._readWechatSettings();
    }
  },
  _renderGroups(
    snapshot: NotificationPreferenceSnapshot | null = notificationPreferenceAction.peekNotificationPreferences(),
  ) {
    if (!snapshot) return;
    this.setData({
      groups: NOTIFICATION_CATEGORIES.map((category) => ({
        category: category.value,
        label: category.label,
        rows: snapshot.rows.filter(
          (row) => row.category === category.value && row.channel !== 'WECHAT_OFFICIAL_ACCOUNT',
        ),
      })),
    });
  },
  async _loadNotificationArea() {
    const session = this._session;
    const generation = ++this._loadGeneration;
    if (!this._ownerUserId) {
      this.setData({ preferenceState: 'signed-out' });
      return;
    }
    this.setData({ preferenceState: 'loading' });
    const current = () => this._isCurrent(session) && generation === this._loadGeneration;
    try {
      const snapshot = await notificationPreferenceAction.getNotificationPreferences({
        force: true,
      });
      if (!current()) return;
      this.setData({ preferenceState: 'ready' });
      this._renderGroups(snapshot);
    } catch {
      if (current()) this.setData({ preferenceState: 'error' });
    }
  },
  onRetryNotificationPreferences() {
    if (
      this.data.preferenceState === 'loading' ||
      this.data.preferenceSavingKey ||
      this.data.subscriptionSettingsPending
    )
      return;
    void this._loadNotificationArea();
  },
  async onNotificationPreferenceChange(event: WechatMiniprogram.SwitchChange) {
    if (this.data.preferenceState !== 'ready' || this.data.preferenceSavingKey) return;
    const { key } = event.currentTarget.dataset as { key: string };
    const row = notificationPreferenceAction
      .peekNotificationPreferences()
      ?.rows.find((item) => item.key === key);
    if (!row || row.channel === 'WECHAT_OFFICIAL_ACCOUNT') return;
    const session = this._session;
    this.setData({ preferenceSavingKey: key });
    try {
      const snapshot = await notificationPreferenceAction.updateNotificationPreference({
        category: row.category,
        channel: row.channel,
        enabled: event.detail.value,
      });
      if (!this._isCurrent(session)) return;
      invalidateBusinessSubscriptions();
      this._renderGroups(snapshot);
      notifyToast({ title: '已保存' });
    } catch {
      if (!this._isCurrent(session)) return;
      this._renderGroups();
      notifyToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      if (this._isCurrent(session)) this.setData({ preferenceSavingKey: '' });
    }
  },
  _readWechatSettings() {
    const session = this._session;
    const generation = ++this._settingGeneration;
    const current = () => this._isCurrent(session) && generation === this._settingGeneration;
    try {
      wx.getSetting({
        withSubscriptions: true,
        success: (result) => {
          if (!current()) return;
          const settings = result.subscriptionsSetting as
            | { mainSwitch?: boolean; itemSettings?: Record<string, string> }
            | undefined;
          this.setData({
            rememberedRejection: Object.values(settings?.itemSettings ?? {}).includes('reject'),
          });
          this.setData({
            wechatMainSwitch:
              typeof settings?.mainSwitch === 'boolean'
                ? settings.mainSwitch
                  ? 'on'
                  : 'off'
                : 'unknown',
          });
          this._renderGroups();
        },
        fail: () => {
          if (!current()) return;
          this.setData({ wechatMainSwitch: 'unknown' });
          this._renderGroups();
        },
      });
    } catch {
      if (current()) {
        this.setData({ wechatMainSwitch: 'unknown' });
        this._renderGroups();
      }
    }
  },
  onOpenSubscriptionSettings() {
    if (!this._isCurrent(this._session) || this.data.subscriptionSettingsPending) return;
    const session = this._session;
    this.setData({ subscriptionSettingsPending: true });
    try {
      wx.openSetting({
        withSubscriptions: true,
        success: () => {
          if (!this._isCurrent(session)) return;
          this._readWechatSettings();
          void this._loadNotificationArea();
        },
        fail: () => {
          if (this._isCurrent(session))
            notifyToast({ title: '暂时无法打开，请重试', icon: 'none' });
        },
        complete: () => {
          if (this._isCurrent(session)) this.setData({ subscriptionSettingsPending: false });
        },
      });
    } catch {
      this.setData({ subscriptionSettingsPending: false });
      notifyToast({ title: '请升级微信后重试', icon: 'none' });
    }
  },
  onGoFeedback() {
    wxSetClipboardData({ data: this.data.wxNumber })
      .then(() => {
        notifyToast({ title: '复制成功' });
      })
      .catch(() => {
        notifyToast({ title: '复制失败' });
      });
  },

  onGoEditProfile() {
    void wxNavigateTo({
      url: '/subpkg_user/pages/edit-profile/edit-profile',
    });
  },

  onGoAgreement() {
    void wxNavigateTo({
      url: '/subpkg_setting/pages/agreement/index',
    });
  },

  async onLogout() {
    const confirmed = await showConfirm({ title: '退出登录', content: '退出当前设备的登录会话？' });
    if (!confirmed) return;
    try {
      await authAction.logout();
      notifyToast({ title: '已退出登录' });
    } catch (error) {
      showErrorToast(error, { fallback: '退出结果尚未确认，请重试' });
    }
  },

  onBack() {
    void wxNavigateBack();
  },
});
