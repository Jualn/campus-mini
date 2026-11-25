import { createBusinessSubscription } from '../../../services/business-subscriptions';
import { createLeaveGuard } from '../../../utils/leave-guard';
import { community } from '../../../services/post-community';
import { canOpenPublicPostDetail, knownSubmission } from '../../../utils/post-community';
import { readQaSummary } from '../../../utils/mentor-qa';
// subpkg_community/pages/post-edit/post-edit.ts

// 换为弹窗形式

import {
  wxGetWindowInfo,
  wxNavigateBack,
  wxOffKeyboardHeightChange,
  wxOnKeyboardHeightChange,
  wxShowModal,
} from '../../../utils/wx-promise';
import * as mediaAction from '../../../actions/media';
import * as postAction from '../../../actions/post';
import type { SelectedMediaFile } from '../../../actions/media';
import { TARGET_TYPES } from '../../../utils/constants';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../../utils/notify';
import { getCurrentIdentity, watchCurrentIdentity } from '../../../actions/current-user';
import { pendingPostCreation } from '../../../actions/post-creation';
import { POST_CAPABILITIES } from '../../../config/post-capabilities';
import { getPostCategories } from '../../../services/post-dictionary';
import { getEditablePost, editPost } from '../../../services/post';
import type {
  PostCategory,
  PostTopic,
  PostEditableRepresentation,
  PostEdit,
} from '../../../types/post-contract';
import { HttpError } from '../../../utils/error';
import { postFieldFeedback } from '../../../utils/post-policy';

Page({
  _openTimer: null as number | null,
  _closeTimer: null as number | null,
  _publishTimer: null as number | null,
  _base: null as PostEditableRepresentation | null,
  _latest: null as Awaited<ReturnType<typeof getEditablePost>> | null,
  _etag: '',
  _resubmit: false,
  _contentLockObserved: false,
  _owner: '',
  _offIdentity: null as (() => void) | null,
  _alive: true,
  _publishAccepted: false,
  _leaveGuard: null as ReturnType<typeof createLeaveGuard> | null,

  _businessSubscription: null as ReturnType<typeof createBusinessSubscription> | null,
  data: {
    // 动画状态
    ready: true, // 首帧即展示完整编辑层，避免路由后再二次弹起
    closing: false, // 触发收起动画

    // 键盘 & 安全区
    keyboardHeight: 0,
    safeBottom: 0,
    panelTop: 72,
    bodyHeight: 0,

    // 表单
    content: '',
    images: [] as string[],
    selectedFiles: [] as SelectedMediaFile[],
    topics: [] as PostTopic[],
    postType: 'NORMAL',
    postId: '',
    title: '',
    organizationEnabled: POST_CAPABILITIES.organization,
    categories: [] as PostCategory[],
    categoryId: '',
    categoryName: '',
    categoryCursor: '',
    categoryLoading: false,
    categoryError: '',
    conflictContent: '',
    conflict: false,
    fieldErrors: [] as string[],
    recoveryNotice: '',
    contentLocked: false,
    lockReady: true,
    editReady: true,

    // 是否可以发布
    canSubmit: false,
    submitting: false,
    selecting: false,
    uploadProgress: 0,

    // 话题输入弹窗
    showTopicInput: false,
    topicInput: '',

    // 自动聚焦
    autoFocus: false,
  },

  onLoad(query: { postType?: string; postId?: string; resubmit?: string }) {
    this._leaveGuard = createLeaveGuard();
    this._owner = getCurrentIdentity().id;
    this._resubmit = query.resubmit === '1';
    this._offIdentity = watchCurrentIdentity(() => {
      if (this._owner === getCurrentIdentity().id) return;
      this._leaveGuard?.(false);
      this._alive = false;
      this._base = null;
      this._etag = '';
      this.setData({
        content: '',
        images: [],
        selectedFiles: [],
        topics: [],
        canSubmit: false,
        editReady: false,
        recoveryNotice: '账号已变化，请退出后重新进入',
      });
    });
    this._alive = true;
    this._businessSubscription = createBusinessSubscription(() => this.isAlive());
    if (query.postType && !['NORMAL', 'MENTOR_QA'].includes(query.postType)) {
      this.setData({ editReady: false, recoveryNotice: '暂不支持此内容类型，请返回' });
      return;
    }
    const postType = query.postType === 'MENTOR_QA' ? 'MENTOR_QA' : 'NORMAL';
    this.setData({
      postType,
      postId: query.postId ?? '',
      editReady: !query.postId,
      contentLocked: !!query.postId,
      lockReady: !query.postId,
    });
    if (query.postId) void this.loadEditable(query.postId);
    else if (POST_CAPABILITIES.organization) void this.loadCategories();
    const sys = wxGetWindowInfo();
    const safeBottom = sys.screenHeight - sys.safeArea.bottom;

    // 自定义导航下以胶囊实际底边为准，再留 16px，避免面板顶部靠近系统操作区。
    const menu = wx.getMenuButtonBoundingClientRect();
    const capsuleBottom = menu.height > 0 ? menu.top + menu.height : (sys.statusBarHeight || 20) + 32;
    const panelTop = capsuleBottom + 16;
    const panelHeight = Math.max(0, sys.windowHeight - panelTop);
    const navHeight = 56 + 16; // handle + nav
    const toolbarH = 72 + 12 * 2; // toolbar
    const bodyHeight = Math.max(0, panelHeight - navHeight - toolbarH);

    this.setData({
      safeBottom,
      panelTop,
      bodyHeight,
    });

    // 监听键盘
    wxOnKeyboardHeightChange((res) => {
      this.setData({
        keyboardHeight: res.height,
      });
    });

    // 仅延后聚焦，不再从空白背景播一次入场动画。
    this._openTimer = setTimeout(() => {
      this._openTimer = null;
      this.setData({ autoFocus: true });
    }, 50);
  },

  onShow() {
    if (!this.data.postId) void this._businessSubscription?.prepare(this.data.postType === 'MENTOR_QA' ? 'MENTOR_QUESTION_PUBLISH' : 'POST_PUBLISH');
    this._leaveGuard?.resume();
  },
  onUnload() {
    this._businessSubscription?.dispose();
    this._alive = false;
    this._offIdentity?.();
    [this._openTimer, this._closeTimer, this._publishTimer].forEach((timer) => {
      if (timer !== null) clearTimeout(timer);
    });
    this._openTimer = null;
    this._closeTimer = null;
    this._publishTimer = null;
    wxOffKeyboardHeightChange();
  },

  isAlive(): boolean {
    return this._alive;
  },
  async loadEditable(postId: string) {
    try {
      const result = await getEditablePost(postId);
      if (!this.isAlive()) return;
      this._base = result.post;
      this._etag = result.etag;
      this.setData({
        postType: result.post.postType,
        contentLocked: result.post.postType === 'MENTOR_QA',
        lockReady: result.post.postType !== 'MENTOR_QA',
        content: result.post.content,
        title: result.post.title ?? '',
        categoryId: result.post.categoryId ?? '',
        topics: result.post.topicIds.map((id) => ({
          id,
          code: '',
          name: id,
          status: 'INACTIVE' as const,
          displayOrder: 0,
        })),
        images: result.post.attachmentItems.map((x) => x.url),
        editReady: true,
        canSubmit: true,
      });
      if (POST_CAPABILITIES.organization) void this.loadCategories();
      // The editable ETag stays separate from dynamic lock facts in the author's private read.
      const detail = POST_CAPABILITIES.communityV1
        ? await this.refreshEditContext(postId)
        : await postAction.getPostDetail(postId).catch(() => null);
      if (!POST_CAPABILITIES.communityV1) this.setData({ contentLocked: false, lockReady: true });
      if (!detail) return;
      if (!this.isAlive()) return;
      this.setData({
        topics: this.data.topics.map(
          (topic) => detail.topics?.find((x) => x.id === topic.id) ?? topic,
        ),
        categoryName: detail.category?.id === result.post.categoryId ? detail.category.name : '',
      });
    } catch (error) {
      showErrorToast(error, { fallback: '编辑内容加载失败' });
    }
  },

  async refreshEditContext(postId: string) {
    const value = await community.myPost(postId);
    if (!this.isAlive()) return null;
    const s = value.submission;
    const summary = readQaSummary(value.post.qaSummary);
    if (summary?.contentLocked) this._contentLockObserved = true;
    this.setData({
      editReady:
        knownSubmission(s) &&
        !s.lifecycle.authorDeleted &&
        !s.lifecycle.adminHidden &&
        (s.availableActions.includes('EDIT') || s.availableActions.includes('RESUBMIT')),
      contentLocked:
        value.post.postType === 'MENTOR_QA'
          ? this._contentLockObserved || (summary?.contentLocked ?? true)
          : false,
      lockReady: value.post.postType !== 'MENTOR_QA' || !!summary,
    });
    return value.post;
  },
  async loadCategories() {
    if (this.data.categoryLoading) return;
    this.setData({ categoryLoading: true, categoryError: '' });
    try {
      const page = await getPostCategories(
        this.data.postType === 'NORMAL' ? 'NORMAL' : 'MENTOR_QA',
        this.data.categoryCursor || undefined,
      );
      if (!this.isAlive()) return;
      this.setData({
        categories: [
          ...this.data.categories,
          ...page.items.filter(
            (x) =>
              x.status === 'ACTIVE' &&
              x.postTypes.includes(this.data.postType === 'NORMAL' ? 'NORMAL' : 'MENTOR_QA'),
          ),
        ],
        categoryCursor: page.nextCursor ?? '',
      });
    } catch (error) {
      this.setData({ categoryError: '分类加载失败，点击重试' });
      showErrorToast(error, { fallback: '分类加载失败' });
    } finally {
      if (this.isAlive()) this.setData({ categoryLoading: false });
    }
  },
  clearCategory() {
    if (this.data.postType === 'NORMAL') this.setData({ categoryId: '', categoryName: '' });
    this.syncLeaveGuard();
  },
  onCategoryChange(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const category = this.data.categories.find((_, index) => index === Number(e.detail.value));
    if (category) this.setData({ categoryId: category.id, categoryName: category.name });
    this.syncLeaveGuard();
  },
  onTitleInput(e: WechatMiniprogram.Input) {
    if (this.data.contentLocked) return;
    this._leaveGuard?.(true);
    this.setData({ title: e.detail.value });
    this.syncLeaveGuard();
  },
  onTopicsChange(e: WechatMiniprogram.CustomEvent<{ topics: PostTopic[] }>) {
    this._leaveGuard?.(true);
    this.setData({ topics: e.detail.topics });
    this.syncLeaveGuard();
  },
  async retryConflict() {
    try {
      this._latest = await getEditablePost(this.data.postId);
      if (POST_CAPABILITIES.communityV1) await this.refreshEditContext(this.data.postId);
      if (this.isAlive())
        this.setData({ conflictContent: JSON.stringify(this._latest.post, null, 2) });
    } catch (error) {
      showErrorToast(error, { fallback: '服务器版本读取失败' });
    }
  },
  acceptMerge() {
    if (!this._latest) return;
    this._base = this._latest.post;
    this._etag = this._latest.etag;
    this._latest = null;
    this.setData({ conflict: false, conflictContent: '' });
  },

  async restoreProtectedContent() {
    if (!this.data.postId || this.data.submitting) return;
    try {
      const latest = await getEditablePost(this.data.postId);
      const confirm = await wxShowModal({
        title: '核对并恢复受保护的原题',
        content: `${latest.post.title ?? ''}\n${latest.post.content.slice(0, 250)}\n图片/附件 ${latest.post.attachmentItems.length.toString()} 项。确认后保留当前分类和话题修改。`,
        confirmText: '确认恢复',
      });
      if (!this.isAlive() || !confirm.confirm) return;
      this._base = latest.post;
      this._etag = latest.etag;
      this.setData({
        title: latest.post.title ?? '',
        content: latest.post.content,
        images: latest.post.attachmentItems.map((x) => x.url),
        selectedFiles: [],
        conflict: false,
        conflictContent: '',
        canSubmit: true,
        recoveryNotice: '原题字段已恢复，可继续核对分类话题',
      });
    } catch (error) {
      showErrorToast(error, { fallback: '原题读取失败，草稿已保留' });
    }
  },
  syncLeaveGuard() {
    const base = this._base;
    const dirty = base
      ? this.data.content !== base.content ||
        this.data.title !== (base.title ?? '') ||
        this.data.categoryId !== (base.categoryId ?? '') ||
        JSON.stringify(this.data.topics.map((t) => t.id)) !== JSON.stringify(base.topicIds) ||
        JSON.stringify(this.data.images) !== JSON.stringify(base.attachmentItems.map((a) => a.url))
      : !!this.data.content ||
        !!this.data.title ||
        !!this.data.images.length ||
        !!this.data.topics.length;
    this._leaveGuard?.(dirty || !!pendingPostCreation('post'));
    return dirty;
  },
  // ─── 关闭 ────────────────────────────────────────────────
  onClose() {
    if (this.data.submitting || this.data.selecting) {
      showInfoToast('正在处理中，请稍候');
      return;
    }
    if (this.syncLeaveGuard()) {
      wxShowModal({
        title: '放弃编辑？',
        content: '内容尚未发布，确认放弃？',
        confirmText: '放弃',
        confirmColor: '#FF3B30',
        cancelText: '继续编辑',
      })
        .then((res) => {
          if (res.confirm) this._closePanel();
        })
        .catch(() => {
          /* 用户取消，不做处理 */
        });
    } else {
      this._closePanel();
    }
  },

  _closePanel() {
    this._leaveGuard?.(false);
    // 先播收起动画，再返回
    this.setData({
      closing: true,
      ready: false,
    });
    if (this._closeTimer !== null) clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      void wxNavigateBack();
    }, 300);
  },

  // ─── 正文 ────────────────────────────────────────────────
  onContentInput(e: WechatMiniprogram.Input) {
    if (this.data.contentLocked || this.data.submitting) return;
    this._leaveGuard?.(true);
    const content = e.detail.value;
    this.setData({
      content,
      canSubmit:
        content.trim().length > 0 ||
        (this.data.postType === 'NORMAL' &&
          POST_CAPABILITIES.communityV1 &&
          this.data.images.length > 0),
    });
    this.syncLeaveGuard();
  },

  // ─── 图片 ────────────────────────────────────────────────
  async onAddImage() {
    if (this.data.contentLocked || this.data.submitting || this.data.selecting) return;
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;

    const owner = this._owner;
    this.setData({ selecting: true });
    try {
      const selectedFiles = await mediaAction.selectImages(remain);
      if (!this.isAlive() || owner !== getCurrentIdentity().id || !selectedFiles.length) return;
      this._leaveGuard?.(true);
      this.setData({
        images: [...this.data.images, ...selectedFiles.map((file) => file.filePath)],
        selectedFiles: [...this.data.selectedFiles, ...selectedFiles],
        canSubmit:
          this.data.content.trim().length > 0 ||
          (this.data.postType === 'NORMAL' && POST_CAPABILITIES.communityV1),
      });
    } catch (error) {
      if (this.isAlive() && owner === getCurrentIdentity().id)
        showErrorToast(error, { fallback: '图片选择失败，请检查权限后重试' });
    } finally {
      if (this.isAlive() && owner === getCurrentIdentity().id) this.setData({ selecting: false });
    }
  },

  onPreviewImage(e: WechatMiniprogram.TouchEvent) {
    if (this.data.submitting) return;
    const index = Number(e.currentTarget.dataset.index);
    const current = this.data.images[index];
    if (!current) return;
    void wx.previewImage({ current, urls: this.data.images });
  },

  onRemoveImage(e: WechatMiniprogram.TouchEvent) {
    if (this.data.contentLocked || this.data.submitting) return;
    const { index } = e.currentTarget.dataset as { index: number };
    const images = this.data.images.filter((_, i) => i !== index);
    const selectedFiles = this.data.selectedFiles.filter(
      (file) => file.filePath !== this.data.images[index],
    );
    this.setData({
      images,
      selectedFiles,
      canSubmit:
        this.data.content.trim().length > 0 ||
        (this.data.postType === 'NORMAL' && POST_CAPABILITIES.communityV1 && images.length > 0),
    });
    this.syncLeaveGuard();
  },

  // ─── 话题 ────────────────────────────────────────────────
  onAddTopic() {
    if (!this.data.organizationEnabled) {
      showInfoToast('话题服务尚未开放');
      return;
    }
    this.setData({ showTopicInput: !this.data.showTopicInput });
  },

  onTopicInput(e: WechatMiniprogram.Input) {
    this.setData({
      topicInput: e.detail.value,
    });
  },

  onConfirmTopic() {
    this.setData({ showTopicInput: false });
  },

  onCloseTopicInput() {
    this.setData({
      showTopicInput: false,
    });
  },

  onRemoveTopic(e: WechatMiniprogram.TouchEvent) {
    const { index } = e.currentTarget.dataset as { index: number };
    const topics = this.data.topics.filter((_, i) => i !== index);
    this.setData({
      topics,
    });
    this.syncLeaveGuard();
  },

  // ─── 收起键盘 ────────────────────────────────────────────
  onHideKeyboard() {
    void wx.hideKeyboard();
  },

  // ─── 发布 ────────────────────────────────────────────────
  async onSubmit() {
    if (this._publishAccepted) return;
    if (
      !this.data.canSubmit ||
      this.data.submitting ||
      this.data.selecting ||
      !this.data.editReady ||
      this.data.conflict
    )
      return;
    if (
      this.data.postType === 'MENTOR_QA' &&
      (!POST_CAPABILITIES.mentorQa ||
        !POST_CAPABILITIES.organization ||
        !POST_CAPABILITIES.communityV1 ||
        !this.data.categoryId ||
        !this.data.content.trim())
    ) {
      showInfoToast('答疑尚未开放或未选择分类');
      return;
    }

    const content = this.data.content.trim();
    if (!content && !(POST_CAPABILITIES.communityV1 && this.data.images.length)) return;
    if (POST_CAPABILITIES.communityV1 && !this._base && pendingPostCreation('post')) {
      this.setData({ recoveryNotice: '上次提交结果未确认，请先核对提交结果' });
      return;
    }

    this._leaveGuard?.(true);
    this.setData({ submitting: true, uploadProgress: 0 });
    if (!this.data.postId && this._businessSubscription &&
        !await this._businessSubscription.request(this.data.postType === 'MENTOR_QA' ? 'MENTOR_QUESTION_PUBLISH' : 'POST_PUBLISH')) {
      if (this.isAlive()) this.setData({ submitting: false });
      this._leaveGuard?.(false);
      return;
    }

    try {
      const attachmentItems =
        this.data.selectedFiles.length > 0
          ? await mediaAction.uploadFilesToCos(TARGET_TYPES.POST.value, this.data.selectedFiles, {
              onProgress: (index, progress) => {
                if (this.isAlive() && this._owner === getCurrentIdentity().id)
                  this.setData({
                    uploadProgress: Math.round(
                      ((index + progress.progress) / this.data.selectedFiles.length) * 100,
                    ),
                  });
              },
            })
          : [];
      if (!this.isAlive()) return;
      const topicIds = this.data.topics.map((topic) => topic.id);
      if (this._base) {
        const base = this._base;
        const patch: PostEdit = {};
        if (base.content !== content) patch.content = content;
        if ((base.title ?? '') !== this.data.title) patch.title = this.data.title || null;
        if ((base.categoryId ?? '') !== this.data.categoryId)
          patch.categoryId = this.data.categoryId || null;
        if (JSON.stringify(base.topicIds) !== JSON.stringify(topicIds)) patch.topicIds = topicIds;
        const kept = base.attachmentItems.filter((x) => this.data.images.includes(x.url));
        if (kept.length !== base.attachmentItems.length || attachmentItems.length)
          patch.attachmentItems = [...kept, ...attachmentItems];
        if (
          this.data.postType === 'MENTOR_QA' &&
          this.data.contentLocked &&
          (patch.title !== undefined ||
            patch.content !== undefined ||
            patch.attachmentItems !== undefined)
        ) {
          this.setData({
            recoveryNotice:
              '原题内容已保护，草稿已保留。请核对并恢复原题字段后仅保存分类话题，补充内容请到普通讨论。',
          });
          return;
        }
        if (this._resubmit && !this.data.contentLocked) patch.content = content;
        const finalImages = patch.attachmentItems ?? base.attachmentItems;
        if (!content && !finalImages.some((x) => x.type === 'IMAGE' && x.url))
          throw new Error('请保留正文或至少一张图片');
        if (!Object.keys(patch).length) {
          showInfoToast('内容未修改');
          return;
        }
        await editPost(base.id, patch, this._etag);
        this.getOpenerEventChannel().emit?.('postEdited');
      } else {
        const accepted = await postAction.publishPostAndSync({
          title: this.data.title || null,
          content,
          attachmentItems,
          ...(this.data.organizationEnabled
            ? {
                postType: this.data.postType as 'NORMAL' | 'MENTOR_QA',
                categoryId: this.data.categoryId || null,
                topicIds,
              }
            : {}),
        });
        if (POST_CAPABILITIES.communityV1 && this.isAlive()) {
          this._leaveGuard?.(false);
          this._publishAccepted = true;
          if (canOpenPublicPostDetail(accepted.lifecycle)) {
            await wx.redirectTo({
              url: `/subpkg_community/pages/detail/detail?postId=${encodeURIComponent(accepted.id)}`,
            });
          } else {
            showInfoToast('已受理，公开后可在信息流查看');
            this._publishTimer = setTimeout(() => {
              this._publishTimer = null;
              this._closePanel();
            }, 1200);
          }
          return;
        }
      }

      if (!this.isAlive()) return;
      this._leaveGuard?.(false);
      this._publishAccepted = true;
      showSuccessToast(this.data.postId ? '保存成功' : '发布成功');

      // 延迟返回，让 toast 显示完
      if (this._publishTimer !== null) clearTimeout(this._publishTimer);
      this._publishTimer = setTimeout(() => {
        this._publishTimer = null;
        this._closePanel();
      }, 1500);
    } catch (err) {
      if (!this.isAlive()) return;
      this.setData({
        recoveryNotice: POST_CAPABILITIES.communityV1
          ? '草稿已保留。提交结果不确定时，请先核对本人帖子与收据，勿重复发布。'
          : '草稿已保留，请先核对发布结果。',
      });
      if (
        err instanceof HttpError &&
        err.problemType === '/problems/mentor-question-content-locked'
      ) {
        this._contentLockObserved = true;
        this.setData({
          contentLocked: true,
          lockReady: true,
          recoveryNotice:
            '原题已有正式回答公开，内容已保护。草稿仍保留，请核对并恢复原题字段后维护分类话题，或回到问题进行普通讨论。',
        });
      }
      if (err instanceof HttpError)
        this.setData({
          fieldErrors: (err.validationErrors ?? []).map((x) =>
            postFieldFeedback(x.pointer, x.code),
          ),
        });
      if (
        err instanceof HttpError &&
        (err.statusCode === 412 || err.statusCode === 428) &&
        this.data.postId
      ) {
        this.setData({ conflict: true, conflictContent: '正在读取服务器版本…' });
        try {
          this._latest = await getEditablePost(this.data.postId);
          if (POST_CAPABILITIES.communityV1) await this.refreshEditContext(this.data.postId);
          if (this.isAlive())
            this.setData({ conflictContent: JSON.stringify(this._latest.post, null, 2) });
        } catch (error) {
          showErrorToast(error, { fallback: '服务器版本读取失败，请重试' });
        }
      }
      showErrorToast(err, {
        fallback: '发布失败，请稍后再试',
      });
    } finally {
      if (this.isAlive()) this.setData({ submitting: false });
    }
  },
});
