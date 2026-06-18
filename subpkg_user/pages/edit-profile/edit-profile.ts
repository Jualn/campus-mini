// subpkg_user/pages/edit-profile/edit-profile.ts

import {
  chooseImages,
  wxGetWindowInfo,
  wxHideLoading,
  wxNavigateBack,
  wxShowLoading,
  wxShowModal,
  wxShowToast,
} from '../../../utils/wx-promise';
import { userService } from '../../../services/index';
import type { EditProfileForm } from '../../../types/business';
import createLogger from '../../../utils/logger';

const log = createLogger('EditProfilePage');

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 88, // rpx → 将在 onLoad 中转为 px
    hasChanged: false,
    _original: {} as EditProfileForm,
    form: {
      nickname: '',
      bio: '',
      avatarUrl: '',
      bannerUrl: '',
    },
  },

  onLoad() {
    const systemInfo = wxGetWindowInfo();
    const statusBarHeight = systemInfo.statusBarHeight; // px
    // 导航内容区固定 44px（与胶囊按钮高度对齐），总高 = 状态栏 + 44px
    this.setData({
      statusBarHeight,
      navBarHeight: statusBarHeight + 44,
    });
    this._loadProfile();
  },

  _loadProfile() {
    userService
      .getEditProfileForm()
      .then((form) => {
        this.setData({
          form: {
            ...form,
          },
          _original: {
            ...form,
          },
        });
      })
      .catch((err: unknown) => {
        log.error('_loadProfile', '加载资料失败:', err);
      });
  },

  onInput(e: WechatMiniprogram.Input) {
    const { field } = e.currentTarget.dataset as { field: string };
    let value = e.detail.value;

    // 修复：textarea 的 maxlength 在部分场景下不截断 e.detail.value
    // 需要手动对齐，保证字数显示和实际内容一致
    const maxLengthMap: Record<string, number> = {
      nickname: 20,
      bio: 80,
      handle: 20,
      dept: 20,
    };
    if (maxLengthMap[field]) {
      value = value.slice(0, maxLengthMap[field]);
    }

    this.setData({
      [`form.${field}`]: value,
    });
    this._checkChanged();
  },

  onSelectGender(e: WechatMiniprogram.TouchEvent) {
    const { gender } = e.currentTarget.dataset as { gender: string };
    this.setData({
      'form.gender': gender,
    });
    this._checkChanged();
  },

  async onChangeAvatar() {
    try {
      const images = await chooseImages(1);
      this.setData({
        'form.avatar': images[0],
      });
      this._checkChanged();
    } catch (err) {
      log.error('onChangeAvatar', '选择头像失败:', err);
      void wxShowToast({
        title: '选择头像失败,请稍后再试',
        icon: 'none',
      });
    }
  },

  async onChangeBanner() {
    try {
      const images = await chooseImages(1);
      this.setData({
        'form.bannerUrl': images[0],
      });
      this._checkChanged();
    } catch (err) {
      log.error('onChangeBanner', '选择封面失败:', err);
      void wxShowToast({
        title: '选择封面失败,请稍后再试',
        icon: 'none',
      });
    }
  },

  _checkChanged() {
    const o = this.data._original;
    const f = this.data.form;
    this.setData({
      hasChanged: Object.keys(o).some(
        (k) => o[k as keyof EditProfileForm] !== f[k as keyof EditProfileForm],
      ),
    });
  },

  onSave() {
    if (!this.data.hasChanged) return;
    if (!this.data.form.nickname.trim()) {
      void wxShowToast({
        title: '昵称不能为空',
        icon: 'none',
      });
      return;
    }
    void wxShowLoading({
      title: '保存中...',
    });
    userService
      .saveEditProfile(this.data.form)
      .then(() => {
        void wxHideLoading();
        void wxShowToast({
          title: '保存成功',
          icon: 'success',
        });
        void wxNavigateBack();
      })
      .catch((err: unknown) => {
        void wxHideLoading();
        log.error('onSave', '保存失败:', err);
        void wxShowToast({
          title: '保存失败,请稍后再试',
          icon: 'none',
        });
      });
  },

  onCancel() {
    if (!this.data.hasChanged) {
      void wxNavigateBack();
      return;
    }
    wxShowModal({
      title: '放弃修改？',
      content: '当前改动尚未保存',
      confirmText: '放弃',
      confirmColor: '#FF3B30',
      cancelText: '继续编辑',
    })
      .then((res) => {
        if (res.confirm) void wxNavigateBack();
      })
      .catch((err: unknown) => {
        log.error('onCancel', '显示确认框失败:', err);
      });
  },
});
