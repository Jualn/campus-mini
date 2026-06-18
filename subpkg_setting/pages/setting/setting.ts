// subpkg_setting/pages/setting/setting.ts

import {
  wxGetAccountInfoSync,
  wxGetWindowInfo,
  wxNavigateBack,
  wxNavigateTo,
  wxShowToast,
} from '../../../utils/wx-promise';
import { userService } from '../../../services/index';
import storage, { STORAGE_KEYS } from '../../../utils/storage';
import type { Settings } from '../../../types/business';
import createLogger from '../../../utils/logger';
import store from '../../../store/index';

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
    const cached = storage.get('userSetting') as Settings | null;
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
    const setting = await userService.getUserSettings();

    const accountInfo = wxGetAccountInfoSync();
    this.setData({
      notify: setting.notify,
      version: accountInfo.miniProgram.version || '开发版',
    });
  },

  async _saveNotify(key: NotifyKey, value: boolean, prevValue: boolean) {
    this._savingKeys.add(key);

    // 延迟显示 loading，避免接口很快返回时的闪烁
    const timer = setTimeout(() => {
      if (this._active) {
        this.setData({ [`notifyPending.${key}`]: true });
      }
    }, 250);
    this._pendingTimers[key] = timer;

    try {
      await userService.updateNotifySetting(key, value);

      // 只合并自己这个字段，避免覆盖其他还在 pending 中、尚未确认的字段
      const cached = (storage.get('userSetting') as Settings | null) ?? {
        notify: { ...this.data.notify },
      };
      const confirmedNotify = { ...cached.notify, [key]: value };
      const settings: Settings = { notify: confirmedNotify };

      storage.set('userSetting', settings);
      store.set('userSetting', settings);

      clearTimeout(timer);
      if (this._active) {
        this.setData({
          [`notify.${key}`]: value, // 兜底：防止 onShow 期间被重置后没同步回来
          [`notifyPending.${key}`]: false,
        });
      }
    } catch (e) {
      clearTimeout(timer);
      log.error('_saveNotify', '保存通知设置失败', e);

      if (this._active) {
        const rolledBackNotify = { ...this.data.notify, [key]: prevValue };
        this.setData({
          [`notify.${key}`]: prevValue,
          [`notifyPending.${key}`]: false,
          [`notifyError.${key}`]: true,
        });
        // 全局 store 只在成功时写入过，这里若 UI 已回滚也保持一致
        store.set('userSetting', { notify: rolledBackNotify });
      }
      // 页面不可见时不做任何 UI 处理，storage 没被写入新值，onShow 会自动纠正
    } finally {
      this._savingKeys.delete(key);
      this._pendingTimers[key] = undefined;
    }
  },

  // 通知开关
  onNotifyChange(e: WechatMiniprogram.SwitchChange) {
    const { key } = e.currentTarget.dataset as { key: NotifyKey };
    const value = e.detail.value;

    // 上一次还没保存完时，忽略本次点击（不依赖 native disabled，避免视觉变灰）
    if (this._savingKeys.has(key)) return;

    const prevValue = this.data.notify[key];

    this.setData({
      [`notify.${key}`]: value,
      [`notifyError.${key}`]: false,
    });

    void this._saveNotify(key, value, prevValue);
  },

  bindMp() {
    const token = storage.get(STORAGE_KEYS.TOKEN);

    if (!token) {
      log.error('bindMp', '用户未登录，无法跳转公众号订阅页');
      void wxShowToast({
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
      void wxShowToast({
        title: '跳转失败，请稍后再试',
        icon: 'error',
      });
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
