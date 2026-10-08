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
import { getErrorMessage, notifyToast } from '../../../utils/notify';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import { getProfileErrorMessage } from '../../../services/user';
import definePage from '../../../utils/definePage';

const log = createLogger('EditProfilePage');

definePage({
  behaviors: [useAsyncLoad()],

  _selectedAvatarFile: [] as SelectedMediaFile[],
  _selectedBackgroundFile: [] as SelectedMediaFile[],
  _saving: false,
  _loadGeneration: 0,

  data: {
    statusBarHeight: 20,
    navBarHeight: 88, // rpx → 将在 onLoad 中转为 px

    hasChanged: false,
    saving: false,
    saveError: '',
    nicknameLength: 0,
    bioLength: 0,

    _original: {} as EditProfileForm,
    form: {
      nickname: '',
      bio: '',
      avatarUrl: '',
      backgroundUrl: '',
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
    const generation = ++this._loadGeneration;
    this._asyncLoadBegin(options);
    try {
      const form = await userAction.getEditProfileForm();

      if (generation !== this._loadGeneration) return;
      this.setData({
        nicknameLength: Array.from(form.nickname).length,
        bioLength: Array.from(form.bio).length,
        form: { ...form },
        _original: { ...form },
      });
      this._asyncLoadSuccess();
    } catch (err: unknown) {
      if (generation !== this._loadGeneration) return;
      log.error('_loadProfile', '加载资料失败:', err);
      this._asyncLoadFail(getProfileErrorMessage(err));
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const { field } = e.currentTarget.dataset as { field: string };
    if (this._saving || (field !== 'nickname' && field !== 'bio')) return;
    const value = e.detail.value;
    // Unicode code points; don't silently truncate historical or pasted values.
    this.setData({
      [`form.${field}`]: value,
      [`${field}Length`]: Array.from(value).length,
    });
    this._checkChanged();
  },

  async onChangeAvatar() {
    if (this._saving) return;
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

  async onChangeBackground() {
    if (this._saving) return;
    try {
      const files = await mediaAction.selectImages(1);
      if (!files.length) return;
      this._selectedBackgroundFile = files;
      this.setData({ 'form.backgroundUrl': files[0].filePath });
      this._checkChanged();
    } catch (err) {
      log.error('onChangeBackground', '选择背景失败:', err);
      notifyToast({ title: '选择背景失败,请稍后再试', icon: 'none' });
    }
  },

  onUnload() {
    this._loadGeneration++;
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
    if (this.data.nicknameLength > 10 || this.data.bioLength > 200) {
      this.setData({ saveError: '昵称最多 10 个字符，简介最多 200 个字符' });
      return;
    }

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
    const hasBackgroundChanged = this._selectedBackgroundFile.length > 0;

    // 没有普通字段变化，也没有图片变化，直接返回
    if (Object.keys(changedForm).length === 0 && !hasAvatarChanged && !hasBackgroundChanged) {
      return;
    }

    this._saving = true;
    this.setData({ saving: true, saveError: '' });
    void wxShowLoading({
      title: '保存中...',
    });

    try {
      const selectedProfileFiles = [
        ...(hasAvatarChanged ? this._selectedAvatarFile : []),
        ...(hasBackgroundChanged ? this._selectedBackgroundFile : []),
      ];
      const uploadedItems =
        selectedProfileFiles.length > 0
          ? await mediaAction.uploadFilesToCos(TARGET_TYPES.USER.value, selectedProfileFiles)
          : [];

      if (hasAvatarChanged) {
        const avatar = uploadedItems[0];
        if (!avatar.url || !avatar.objectKey) throw new Error('头像上传结果不完整');
        changedForm.avatarObjectKey = avatar.objectKey;
      }
      if (hasBackgroundChanged) {
        const background = uploadedItems[hasAvatarChanged ? 1 : 0];
        if (!background.url || !background.objectKey) throw new Error('背景上传结果不完整');
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
      this._selectedBackgroundFile = [];

      notifyToast({
        title: '保存成功',
        icon: 'success',
      });

      void wxNavigateBack();
    } catch (err) {
      log.error('onSave', '保存失败:', err);
      this.setData({ saveError: getErrorMessage(err, '保存结果未确认，请重新加载资料后再试') });
    } finally {
      this._saving = false;
      this.setData({ saving: false });
      void wxHideLoading();
    }
  },

  onCancel() {
    if (this._saving) return;
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
          this._selectedBackgroundFile = [];
        }
      })
      .catch((err: unknown) => {
        log.error('onCancel', '显示确认框失败:', err);
      });
  },
});
