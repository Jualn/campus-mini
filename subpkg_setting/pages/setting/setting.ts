// subpkg_setting/pages/setting/setting.ts

import {
  wxGetAccountInfoSync,
  wxGetWindowInfo,
  wxNavigateBack,
  wxNavigateTo,
  wxSetClipboardData,
  showConfirm,
} from '../../../utils/wx-promise';
import * as authAction from '../../../actions/auth';
import * as userAction from '../../../actions/user';
import * as notificationPreferenceAction from '../../actions/notification-preferences';
import { api } from '../../../services/api';
import type { Settings } from '../../../types/business';
import type { NotificationPreferenceRow } from '../../services/notification-preferences';
import { createLogger } from '../../../utils/logger';
import { notifyToast, showErrorToast } from '../../../utils/notify';

const log = createLogger('SettingPage');

type LegacyNotifyKey = 'interaction' | 'system';

const LEGACY_NOTIFY_KEYS: LegacyNotifyKey[] = ['interaction', 'system'];

const createLegacyFlagMap = (value: boolean): Record<LegacyNotifyKey, boolean> =>
  LEGACY_NOTIFY_KEYS.reduce(
    (acc, key) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<LegacyNotifyKey, boolean>,
  );

const splitPreferenceRows = (rows: NotificationPreferenceRow[]) => ({
  activityPreferenceRows: rows.filter(
    (row) => row.category === 'ACTIVITY' && row.channel !== 'WECHAT_MINI_PROGRAM',
  ),
  publicEventPreferenceRows: rows.filter(
    (row) => row.category === 'PUBLIC_EVENT' && row.channel !== 'WECHAT_MINI_PROGRAM',
  ),
});

Page({
  _active: true,
  _savingKeys: new Set<string>(),
  _pendingTimers: Object.create(null) as Record<string, number | undefined>,
  _refreshPreferencesOnShow: false,

  data: {
    statusBarHeight: 20,
    wxNumber: 'chan50813',
    version: '1.0.0',

    activityPreferenceRows: [] as NotificationPreferenceRow[],
    publicEventPreferenceRows: [] as NotificationPreferenceRow[],
    preferenceState: 'loading',
    preferenceStateTitle: '正在加载通知偏好',
    preferenceStateDesc: '',
    preferenceSavingKey: '',
    legacyNotify: {
      interaction: false,
      system: true,
    },
    legacyNotifyPending: createLegacyFlagMap(false),
    legacyNotifyError: createLegacyFlagMap(false),
  },

  async onLoad() {
    const sys = wxGetWindowInfo();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
    });
    await this._loadSettings();
  },

  onShow() {
    this._active = true;
    const preferenceSnapshot = notificationPreferenceAction.peekNotificationPreferences();
    const cached = userAction.getCachedUserSettings();
    this.setData({
      ...(preferenceSnapshot ? splitPreferenceRows(preferenceSnapshot.rows) : {}),
      ...(cached?.notify
        ? {
            legacyNotify: {
              interaction: cached.notify.interaction,
              system: cached.notify.system,
            },
          }
        : {}),
      preferenceSavingKey: '',
      legacyNotifyPending: createLegacyFlagMap(false),
    });
    if (this._refreshPreferencesOnShow && this.data.preferenceState !== 'loading') {
      this._refreshPreferencesOnShow = false;
      void this._loadNotificationPreferences();
    }
  },

  onHide() {
    this._active = false;
  },

  onUnload() {
    this._active = false;
    Object.values(this._pendingTimers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  },

  async _loadSettings() {
    const accountInfo = wxGetAccountInfoSync();
    this.setData({
      version: accountInfo.miniProgram.version || '开发版',
    });

    const legacyTask = userAction.getUserSettings().catch((err: unknown) => {
      log.error('_loadSettings', '加载其他通知设置失败', err);
      return null;
    });
    const preferenceTask = this._loadNotificationPreferences();

    const [setting] = await Promise.all([legacyTask, preferenceTask]);
    this.setData({
      ...(setting
        ? {
            legacyNotify: {
              interaction: setting.notify.interaction,
              system: setting.notify.system,
            },
          }
        : {}),
    });
  },

  async _loadNotificationPreferences() {
    const existingSnapshot = notificationPreferenceAction.peekNotificationPreferences();
    this.setData({
      preferenceState: 'loading',
      preferenceStateTitle: '正在加载通知偏好',
      preferenceStateDesc: existingSnapshot ? '已保留上次成功读取的状态' : '',
    });

    try {
      const snapshot = await notificationPreferenceAction.getNotificationPreferences({
        force: true,
      });
      if (!this._active) return;
      this.setData({
        ...splitPreferenceRows(snapshot.rows),
        preferenceState: 'ready',
        preferenceStateTitle: '',
        preferenceStateDesc: '',
      });
    } catch (err) {
      log.error('_loadNotificationPreferences', '加载 Activity/PublicEvent 通知偏好失败', err);
      if (!this._active) return;

      const unavailable = notificationPreferenceAction.isNotificationPreferencesUnavailable(err);
      const hasExisting = Boolean(notificationPreferenceAction.peekNotificationPreferences());
      this.setData({
        preferenceState: unavailable ? 'unavailable' : 'error',
        preferenceStateTitle: unavailable ? '通知偏好暂不可用' : '通知偏好加载失败',
        preferenceStateDesc: hasExisting
          ? '已保留上次显示，未改为默认值'
          : '当前无法确认偏好，不会显示为全部关闭',
      });

      if (!unavailable) {
        showErrorToast(err, { fallback: '活动与公共事项通知状态加载失败' });
      }
    }
  },

  onRetryNotificationPreferences() {
    if (this.data.preferenceState === 'loading') return;
    void this._loadNotificationPreferences();
  },

  async onNotificationPreferenceChange(e: WechatMiniprogram.SwitchChange) {
    if (this.data.preferenceState !== 'ready' || this.data.preferenceSavingKey) return;
    const { key, category, channel } = e.currentTarget.dataset as {
      key: string;
      category: NotificationPreferenceRow['category'];
      channel: NotificationPreferenceRow['channel'];
    };
    const previousSnapshot = notificationPreferenceAction.peekNotificationPreferences();
    if (!previousSnapshot) {
      void this._loadNotificationPreferences();
      return;
    }

    this.setData({ preferenceSavingKey: key });
    try {
      if (e.detail.value && channel === 'WECHAT_OFFICIAL_ACCOUNT') {
        const confirmed = await showConfirm({
          title: '服务号通知需单独开通',
          content:
            '这里仅开启应用发送。还需绑定服务号，并在服务号订阅页开启对应通知，否则只会收到站内消息。继续开启？',
        });
        if (!confirmed) {
          if (this._active) {
            this.setData({
              ...splitPreferenceRows(previousSnapshot.rows),
              preferenceSavingKey: '',
            });
          }
          return;
        }
      }

      const snapshot = await notificationPreferenceAction.updateNotificationPreference({
        category,
        channel,
        enabled: e.detail.value,
      });
      if (!this._active) return;
      this.setData({
        ...splitPreferenceRows(snapshot.rows),
        preferenceSavingKey: '',
      });
    } catch (err) {
      log.error('onNotificationPreferenceChange', '保存通知偏好失败', err);
      if (!this._active) return;
      const unavailable = notificationPreferenceAction.isNotificationPreferencesUnavailable(err);
      this.setData({
        ...splitPreferenceRows(previousSnapshot.rows),
        preferenceSavingKey: '',
        ...(unavailable
          ? {
              preferenceState: 'unavailable',
              preferenceStateTitle: '通知偏好暂不可用',
              preferenceStateDesc: '已恢复保存前状态，请稍后重试',
            }
          : {}),
      });
      if (!unavailable) showErrorToast(err, { fallback: '通知偏好保存失败' });
    }
  },

  async _saveLegacyNotify(key: LegacyNotifyKey, value: boolean, prevValue: boolean) {
    this._savingKeys.add(key);

    const timer = setTimeout(() => {
      if (this._active) {
        this.setData({ [`legacyNotifyPending.${key}`]: true });
      }
    }, 250);
    this._pendingTimers[key] = timer;

    try {
      const currentNotify = userAction.getCachedUserSettings()?.notify;
      const fallbackNotify: Settings['notify'] = {
        activity: false,
        exam: false,
        interaction: this.data.legacyNotify.interaction,
        system: this.data.legacyNotify.system,
        audit: true,
      };
      await userAction.updateNotifySettingAndSync(key, value, currentNotify ?? fallbackNotify);

      clearTimeout(timer);
      if (this._active) {
        this.setData({
          [`legacyNotify.${key}`]: value,
          [`legacyNotifyPending.${key}`]: false,
        });
      }
    } catch (e) {
      clearTimeout(timer);
      log.error('_saveLegacyNotify', '保存旧类型通知设置失败', e);

      if (this._active) {
        this.setData({
          [`legacyNotify.${key}`]: prevValue,
          [`legacyNotifyPending.${key}`]: false,
          [`legacyNotifyError.${key}`]: true,
        });
      }
    } finally {
      this._savingKeys.delete(key);
      this._pendingTimers[key] = undefined;
    }
  },

  onLegacyNotifyChange(e: WechatMiniprogram.SwitchChange) {
    const { key } = e.currentTarget.dataset as { key: LegacyNotifyKey };
    const value = e.detail.value;

    if (this._savingKeys.has(key)) return;

    const prevValue = this.data.legacyNotify[key];

    this.setData({
      [`legacyNotify.${key}`]: value,
      [`legacyNotifyError.${key}`]: false,
    });

    void this._saveLegacyNotify(key, value, prevValue);
  },

  async bindMp() {
    const token = authAction.getToken();

    if (!token) {
      log.error('bindMp', '用户未登录，无法跳转公众号订阅页');
      notifyToast({
        title: '用户未登录，无法跳转公众号订阅页',
        icon: 'error',
      });
      return;
    }

    try {
      const result = await api.wx.createOfficialAccountBindOauthUrl();
      if (!result.url) throw new Error('服务号绑定地址为空');

      this._refreshPreferencesOnShow = true;
      await wxNavigateTo({
        url:
          '/subpkg_setting/pages/service-subscribe-webview/index?url=' +
          encodeURIComponent(result.url),
      });
    } catch (err) {
      this._refreshPreferencesOnShow = false;
      log.error('bindMp', '获取或打开服务号绑定页失败', err);
      notifyToast({
        title: '跳转失败，请稍后再试',
        icon: 'error',
      });
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

  onBack() {
    void wxNavigateBack();
  },
});
