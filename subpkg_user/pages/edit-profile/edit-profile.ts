// subpkg_user/pages/edit-profile/edit-profile.ts

import {
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
import { getCurrentIdentity, watchCurrentAccount } from '../../../actions/current-user';
import { createLeaveGuard } from '../../../utils/leave-guard';
import { getAvatarInfo } from '../../../utils/avatar';

const log = createLogger('EditProfilePage');

definePage({
  behaviors: [useAsyncLoad()],

  _selectedAvatarFile: [] as SelectedMediaFile[],
  _selectedBackgroundFile: [] as SelectedMediaFile[],
  _saving: false,
  _loadGeneration: 0,
  _alive: true,
  _owner: '',
  _sessionRevision: 0,
  _offAccount: null as (() => void) | null,
  _leaveGuard: null as ReturnType<typeof createLeaveGuard> | null,

  data: {
    avatarPreview: getAvatarInfo(''),
    hasChanged: false,
    saving: false,
    saveError: '',
    fieldErrors: { nickname: '', bio: '' },
    selecting: false,
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
    this._alive = true;
    this._owner = getCurrentIdentity().id;
    this._leaveGuard = createLeaveGuard();
    this._offAccount = watchCurrentAccount(() => {
      ++this._sessionRevision;
      ++this._loadGeneration;
      this._owner = getCurrentIdentity().id;
      this._selectedAvatarFile = [];
      this._selectedBackgroundFile = [];
      this._saving = false;
      this._leaveGuard?.(false);
      this.setData({
        form: { nickname: '', bio: '', avatarUrl: '', backgroundUrl: '' },
        avatarPreview: getAvatarInfo(''),
        _original: { nickname: '', bio: '', avatarUrl: '', backgroundUrl: '' },
        hasChanged: false,
        saving: false,
        selecting: false,
        saveError: '登录身份已变化，请重新读取资料后编辑',
      });
      this._asyncLoadFail('登录身份已变化，请重新读取资料后编辑');
    });
    void this._loadProfile();
  },

  async _loadProfile(options: { preserveError?: boolean } = {}) {
    const generation = ++this._loadGeneration;
    this._asyncLoadBegin(options);
    try {
      const form = await userAction.getEditProfileForm();

      if (generation !== this._loadGeneration) return;
      const hasDraft = this.data.hasChanged;
      this.setData({
        ...(!hasDraft
          ? {
              nicknameLength: Array.from(form.nickname).length,
              avatarPreview: getAvatarInfo(form.nickname),
              bioLength: Array.from(form.bio).length,
              form: { ...form },
            }
          : {}),
        _original: { ...form },
      });
      this._checkChanged();
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
      [`fieldErrors.${field}`]: '',
      ...(field === 'nickname' ? { avatarPreview: getAvatarInfo(value) } : {}),
    });
    this._checkChanged();
  },

  async onChangeAvatar() {
    const revision = this._sessionRevision;
    if (this._saving || this.data.selecting) return;
    this.setData({ selecting: true });
    try {
      const selectedFiles = await mediaAction.selectImages(1);
      if (!this.isSessionCurrent(revision) || !selectedFiles.length) return;
      const newImgs = selectedFiles.map((f) => f.filePath);

      this.setData({
        'form.avatarUrl': newImgs[0],
      });
      this._selectedAvatarFile = selectedFiles;

      this._checkChanged();
    } catch (err) {
      if (!this.isSessionCurrent(revision)) return;
      log.error('onChangeAvatar', '选择头像失败:', err);
      notifyToast({
        title: '选择头像失败,请稍后再试',
        icon: 'none',
      });
    } finally {
      if (this.isSessionCurrent(revision)) this.setData({ selecting: false });
    }
  },

  async onChangeBackground() {
    const revision = this._sessionRevision;
    if (this._saving || this.data.selecting) return;
    this.setData({ selecting: true });
    try {
      const files = await mediaAction.selectImages(1);
      if (!this.isSessionCurrent(revision) || !files.length) return;
      this._selectedBackgroundFile = files;
      this.setData({ 'form.backgroundUrl': files[0].filePath });
      this._checkChanged();
    } catch (err) {
      if (!this.isSessionCurrent(revision)) return;
      log.error('onChangeBackground', '选择背景失败:', err);
      notifyToast({ title: '选择背景失败,请稍后再试', icon: 'none' });
    } finally {
      if (this.isSessionCurrent(revision)) this.setData({ selecting: false });
    }
  },

  onShow() {
    this._leaveGuard?.resume();
  },
  onUnload() {
    this._offAccount?.();
    ++this._sessionRevision;
    this._alive = false;
    this._loadGeneration++;
  },

  isSessionCurrent(revision: number) {
    return (
      this._alive && revision === this._sessionRevision && this._owner === getCurrentIdentity().id
    );
  },
  isAlive() {
    return this._alive;
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
    this._leaveGuard?.(this.data.hasChanged);
  },

  async onSave() {
    const revision = this._sessionRevision;
    if (this._saving || this.data.selecting) return;
    if (!this.data.hasChanged) return;
    const fieldErrors = {
      nickname: !this.data.form.nickname.trim()
        ? '请填写昵称'
        : this.data.nicknameLength > 10
          ? '昵称最多 10 个字符'
          : '',
      bio: this.data.bioLength > 200 ? '简介最多 200 个字符' : '',
    };
    this.setData({ fieldErrors, saveError: '' });
    if (fieldErrors.nickname || fieldErrors.bio) return;

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
      if (!this.isSessionCurrent(revision)) return;

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
      if (!this.isSessionCurrent(revision)) return;

      this._leaveGuard?.(false);
      this._selectedAvatarFile = [];
      this._selectedBackgroundFile = [];

      notifyToast({
        title: '保存成功',
        icon: 'success',
      });

      void wxNavigateBack();
    } catch (err) {
      if (!this.isSessionCurrent(revision)) return;
      log.error('onSave', '保存失败:', err);
      this.setData({ saveError: getErrorMessage(err, '保存结果未确认，请重新加载资料后再试') });
    } finally {
      if (this.isSessionCurrent(revision)) {
        this._saving = false;
        this.setData({ saving: false });
      }
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
          this._leaveGuard?.(false);
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
