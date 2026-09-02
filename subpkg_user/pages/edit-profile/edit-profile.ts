// subpkg_user/pages/edit-profile/edit-profile.ts

import {
  wxGetWindowInfo,
  wxHideLoading,
  wxNavigateBack,
  wxShowLoading,
  wxShowModal,
} from '../../../utils/wx-promise';
import type { EditProfileForm, EditProfileUpdate } from '../../../types/business';
import { createLogger } from '../../../utils/logger';
import { type SelectedMediaFile } from '../../../actions/media';
import { TARGET_TYPES } from '../../../utils/constants';
import * as mediaAction from '../../../actions/media';
import * as userAction from '../../../actions/user';
import { notifyToast } from '../../../utils/notify';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';

const log = createLogger('EditProfilePage');

definePage({
  behaviors: [useAsyncLoad()],

  _selectedAvatarFile: [] as SelectedMediaFile[],
  _selectedBannerFile: [] as SelectedMediaFile[],
  _saving: false,

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
    void this._loadProfile();
  },

  async _loadProfile(options: { preserveError?: boolean } = {}) {
    this._asyncLoadBegin(options);
    try {
      const form = await userAction.getEditProfileForm();

      this.setData({
        form: { ...form },
        _original: { ...form },
      });
      this._asyncLoadSuccess();
    } catch (err: unknown) {
      log.error('_loadProfile', '加载资料失败:', err);
      this._asyncLoadFail('网络可能暂时不可用，请稍后再试');
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
    void this._loadProfile({ preserveError: true });
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
    if (this._saving) return;
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

    const changedForm: EditProfileUpdate = {};

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

    this._saving = true;
    void wxShowLoading({
      title: '保存中...',
    });

    try {
      const selectedProfileFiles = [
        ...(hasAvatarChanged ? this._selectedAvatarFile : []),
        ...(hasBannerChanged ? this._selectedBannerFile : []),
      ];
      const uploadedItems =
        selectedProfileFiles.length > 0
          ? await mediaAction.uploadFilesToCos(TARGET_TYPES.USER.value, selectedProfileFiles)
          : [];
      let uploadedIndex = 0;

      if (hasAvatarChanged) {
        const avatar = uploadedItems[uploadedIndex++];
        if (!avatar.url || !avatar.objectKey) throw new Error('头像上传结果不完整');
        changedForm.avatarUrl = avatar.url;
        changedForm.avatarObjectKey = avatar.objectKey;
      }

      if (hasBannerChanged) {
        const background = uploadedItems[uploadedIndex];
        if (!background.url || !background.objectKey) throw new Error('背景图上传结果不完整');
        changedForm.bannerUrl = background.url;
        changedForm.backgroundObjectKey = background.objectKey;
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
      this._saving = false;
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
