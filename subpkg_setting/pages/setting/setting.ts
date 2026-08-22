// subpkg_setting/pages/setting/setting.ts

import {
  wxGetAccountInfoSync,
  wxGetWindowInfo,
  wxNavigateBack,
  wxNavigateTo,
  wxSetClipboardData,
} from '../../../utils/wx-promise';
import { authAction, userAction } from '../../../actions/index';
import type { Settings } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { notifyToast } from '../../../utils/notify';

const log = createLogger('SettingPage');

type NotifyKey = keyof Settings['notify'];

const NOTIFY_KEYS: NotifyKey[] = ['activity', 'exam', 'interaction', 'system', 'audit'];

const createFlagMap = (value: boolean): Record<NotifyKey, boolean> =>
  NOTIFY_KEYS.reduce(
    (acc, key) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<NotifyKey, boolean>,
  );

Page({
  _active: true,
  _savingKeys: new Set<NotifyKey>(),
  _pendingTimers: Object.create(null) as Partial<Record<NotifyKey, number>>,

  data: {
    statusBarHeight: 20,
    wxNumber: 'chan50813',
    version: '1.0.0',

    // 通知设置
    notify: {
      activity: false,
      exam: false,
      interaction: false,
      system: true,
      audit: true,
    },
    notifyPending: createFlagMap(false),
    notifyError: createFlagMap(false),
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
    // 用本地缓存（只有保存成功才会更新）兜底纠正离开期间残留的乐观状态
    const cached = userAction.getCachedUserSettings();
    this.setData({
      ...(cached?.notify ? { notify: cached.notify } : {}),
      notifyPending: createFlagMap(false), // 离开期间发出的请求此时一定已有结果，清掉可能卡住的 spinner
    });
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
    const setting = await userAction.getUserSettings();

    const accountInfo = wxGetAccountInfoSync();
    this.setData({
      notify: setting.notify,
      version: accountInfo.miniProgram.version || '开发版',
    });
  },

  async _saveNotify(key: NotifyKey, value: boolean, prevValue: boolean) {
    this._savingKeys.add(key);

    const timer = setTimeout(() => {
      if (this._active) {
        this.setData({ [`notifyPending.${key}`]: true });
      }
    }, 250);
    this._pendingTimers[key] = timer;

    try {
      await userAction.updateNotifySettingAndSync(key, value, this.data.notify);

      clearTimeout(timer);
      if (this._active) {
        this.setData({
          [`notify.${key}`]: value,
          [`notifyPending.${key}`]: false,
        });
      }
    } catch (e) {
      clearTimeout(timer);
      log.error('_saveNotify', '????????', e);

      if (this._active) {
        this.setData({
          [`notify.${key}`]: prevValue,
          [`notifyPending.${key}`]: false,
          [`notifyError.${key}`]: true,
        });
      }
    } finally {
      this._savingKeys.delete(key);
      this._pendingTimers[key] = undefined;
    }
  },

  onNotifyChange(e: WechatMiniprogram.SwitchChange) {
    const { key } = e.currentTarget.dataset as { key: NotifyKey };
    const value = e.detail.value;

    if (this._savingKeys.has(key)) return;

    const prevValue = this.data.notify[key];

    this.setData({
      [`notify.${key}`]: value,
      [`notifyError.${key}`]: false,
    });

    void this._saveNotify(key, value, prevValue);
  },

  bindMp() {
    const token = authAction.getToken();

    if (!token) {
      log.error('bindMp', '用户未登录，无法跳转公众号订阅页');
      notifyToast({
        title: '用户未登录，无法跳转公众号订阅页',
        icon: 'error',
      });
      return;
    }

    const h5EntryUrl = `https://api.jualn.cn/third/wx/mp-oauth/start?token=${encodeURIComponent(token)}`;

    wxNavigateTo({
      url:
        '/subpkg_setting/pages/service-subscribe-webview/index?url=' +
        encodeURIComponent(h5EntryUrl),
    }).catch((err: unknown) => {
      log.error('bindMp', '跳转公众号订阅页失败', err);
      notifyToast({
        title: '跳转失败，请稍后再试',
        icon: 'error',
      });
    });
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
