// subpkg_user/pages/edit-profile/edit-profile.ts

import {
  wxGetWindowInfo,
  wxHideLoading,
  wxNavigateBack,
  wxShowLoading,
  wxShowModal,
} from '../../../utils/wx-promise';
import type { EditProfileForm } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { type SelectedMediaFile } from '../../../actions/media';
import { TARGET_TYPES } from '../../../utils/constants';
import { mediaAction, userAction } from '../../../actions/index';
import { notifyToast } from '../../../utils/notify';

const log = createLogger('EditProfilePage');

Page({
  _selectedAvatarFile: [] as SelectedMediaFile[],
  _selectedBannerFile: [] as SelectedMediaFile[],

  data: {
    statusBarHeight: 20,
    navBarHeight: 88, // rpx → 将在 onLoad 中转为 px

    loading: false,
    loadError: false,

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
    void this._loadProfile();
  },

  async _loadProfile() {
    this.setData({
      loading: true,
      loadError: false,
    });
    const start = Date.now();
    try {
      const form = await userAction.getEditProfileForm();

      const cost = Date.now() - start;
      const min = 300;

      if (cost < min) {
        await new Promise((r) => setTimeout(r, min - cost));
      }

      this.setData({
        form: { ...form },
        _original: { ...form },
        loading: false,
        loadError: false,
      });
    } catch (err: unknown) {
      log.error('_loadProfile', '加载资料失败:', err);

      this.setData({
        loading: false,
        loadError: true,
      });
    }
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
      const selectedFiles = await mediaAction.selectImages(1);
      const newImgs = selectedFiles.map((f) => f.filePath);

      this.setData({
        'form.avatarUrl': newImgs[0],
      });
      this._selectedAvatarFile = selectedFiles;

      this._checkChanged();
    } catch (err) {
      log.error('onChangeAvatar', '选择头像失败:', err);
      notifyToast({
        title: '选择头像失败,请稍后再试',
        icon: 'none',
      });
    }
  },

  async onChangeBanner() {
    try {
      const selectedFiles = await mediaAction.selectImages(1);
      const newImgs = selectedFiles.map((f) => f.filePath);

      this.setData({
        'form.bannerUrl': newImgs[0],
      });
      this._selectedBannerFile = selectedFiles;

      this._checkChanged();
    } catch (err) {
      log.error('onChangeBanner', '选择封面失败:', err);
      notifyToast({
        title: '选择封面失败,请稍后再试',
        icon: 'none',
      });
    }
  },

  onRetry() {
    void this._loadProfile();
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

  async onSave() {
    if (!this.data.hasChanged) return;

    if (!this.data.form.nickname.trim()) {
      notifyToast({
        title: '昵称不能为空',
        icon: 'none',
      });
      return;
    }

    const original = this.data._original;
    const current = this.data.form;

    const changedForm: Partial<EditProfileForm> = {};

    // 只提交发生变化的普通字段
    if (current.nickname !== original.nickname) {
      changedForm.nickname = current.nickname;
    }

    if (current.bio !== original.bio) {
      changedForm.bio = current.bio;
    }

    const hasAvatarChanged = this._selectedAvatarFile.length > 0;
    const hasBannerChanged = this._selectedBannerFile.length > 0;

    // 没有普通字段变化，也没有图片变化，直接返回
    if (Object.keys(changedForm).length === 0 && !hasAvatarChanged && !hasBannerChanged) {
      return;
    }

    void wxShowLoading({
      title: '保存中...',
    });

    try {
      if (hasAvatarChanged) {
        const avatarUrl = await mediaAction.uploadAndSaveFiles(
          TARGET_TYPES.USER.value,
          this._selectedAvatarFile,
        );

        if (avatarUrl[0]?.url) {
          changedForm.avatarUrl = avatarUrl[0].url;
        }
      }

      if (hasBannerChanged) {
        const bannerUrl = await mediaAction.uploadAndSaveFiles(
          TARGET_TYPES.USER.value,
          this._selectedBannerFile,
        );

        if (bannerUrl[0]?.url) {
          changedForm.bannerUrl = bannerUrl[0].url;
        }
      }

      if (Object.keys(changedForm).length === 0) {
        notifyToast({
          title: '没有需要保存的内容',
          icon: 'none',
        });
        return;
      }

      await userAction.saveEditProfileAndSync(changedForm);

      this._selectedAvatarFile = [];
      this._selectedBannerFile = [];

      notifyToast({
        title: '保存成功',
        icon: 'success',
      });

      void wxNavigateBack();
    } catch (err) {
      log.error('onSave', '保存失败:', err);
      notifyToast({
        title: '保存失败,请稍后再试',
        icon: 'none',
      });
    } finally {
      void wxHideLoading();
    }
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
        if (res.confirm) {
          void wxNavigateBack();

          this._selectedAvatarFile = [];
          this._selectedBannerFile = [];
        }
      })
      .catch((err: unknown) => {
        log.error('onCancel', '显示确认框失败:', err);
      });
  },
});
