// components/post-edit-panel/index.ts
import { useSheet } from '../../behaviors/sheet-mixin';
import defineComponent from '../../utils/defineComponent';
import { createLogger } from '../../utils/logger';
import { notifyToast } from '../../utils/notify';
import type { SelectedMediaFile } from '../../actions/media';
import * as mediaAction from '../../actions/media';
import { POST_CAPABILITIES } from '../../config/post-capabilities';
import type { PostCategory, PostTopic } from '../../types/post-contract';
import { getPostCategories } from '../../services/post-dictionary';
import { createLeaveGuard } from '../../utils/leave-guard';
import { wxShowModal } from '../../utils/wx-promise';
import { getCurrentIdentity, watchCurrentIdentity } from '../../actions/current-user';

const log = createLogger('PostEditPanel');

interface PostEditPanelPrivate {
  _content: string;
  _mirrorTimer: ReturnType<typeof setTimeout> | null;
  _uiTimer: ReturnType<typeof setTimeout> | null;
  _selectedFiles: SelectedMediaFile[];
  _generation: number;
  _owner: string;
  _offIdentity: null | (() => void);
  _leaveGuard: null | ReturnType<typeof createLeaveGuard>;
}

defineComponent<PostEditPanelPrivate>()({
  options: {
    multipleSlots: true,
  },

  behaviors: [useSheet()],

  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    busy: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    organizationEnabled: POST_CAPABILITIES.organization,
    topics: [] as PostTopic[],
    categories: [] as PostCategory[],
    categoryId: '',
    categoryName: '',
    categoryCursor: '',
    categoryLoading: false,
    categoryError: '',
    showTopics: false,
    mirrorContent: '\n',
    content: '',
    images: [] as string[],
    canSubmit: false,
    dirty: false,
    selecting: false,
    kbHeight: 0,
    contentLength: 0,
    focused: false,
  },

  lifetimes: {
    attached() {
      this._content = '';
      this._mirrorTimer = null;
      this._uiTimer = null;
      this._selectedFiles = [];
      this._generation = 0;
      this._owner = getCurrentIdentity().id;
      this._leaveGuard = createLeaveGuard();
      this._offIdentity = watchCurrentIdentity(() => {
        if (this._owner === getCurrentIdentity().id) return;
        ++this._generation;
        this._leaveGuard?.(false);
        this._selectedFiles = [];
        this.setData({
          content: '',
          images: [],
          topics: [],
          categoryId: '',
          categoryName: '',
          canSubmit: false,
          dirty: false,
          focused: false,
        });
        this.closeSheet();
      });
      if (POST_CAPABILITIES.organization) void this.loadCategories();

      this._uiTimer = setTimeout(() => {
        this.setData({ focused: true });
      }, 30);
    },

    detached() {
      ++this._generation;
      this._leaveGuard?.(false);
      this._offIdentity?.();
      this._offIdentity = null;
      if (this._mirrorTimer) clearTimeout(this._mirrorTimer);
      if (this._uiTimer) clearTimeout(this._uiTimer);
      this._mirrorTimer = null;
      this._uiTimer = null;
      this._content = '';
      this._selectedFiles = [];
    },
  },

  pageLifetimes: {
    show() {
      this._leaveGuard?.resume();
    },
  },

  methods: {
    markDirty() {
      this._leaveGuard?.(true);
      if (!this.data.dirty) this.setData({ dirty: true });
    },

    async loadCategories() {
      if (this.data.categoryLoading || !this.data.organizationEnabled) return;
      const generation = this._generation;
      this.setData({ categoryLoading: true, categoryError: '' });
      try {
        const page = await getPostCategories('NORMAL', this.data.categoryCursor || undefined);
        if (generation !== this._generation) return;
        this.setData({
          categories: [
            ...this.data.categories,
            ...page.items.filter((item) => item.status === 'ACTIVE' && item.postTypes.includes('NORMAL')),
          ],
          categoryCursor: page.nextCursor ?? '',
        });
      } catch {
        if (generation === this._generation) this.setData({ categoryError: '分类加载失败，点击重试' });
      } finally {
        if (generation === this._generation) this.setData({ categoryLoading: false });
      }
    },

    onCategoryChange(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      if (this.data.busy) return;
      const category = this.data.categories[Number(e.detail.value)];
      if (!category) return;
      this.markDirty();
      this.setData({ categoryId: category.id, categoryName: category.name });
    },

    clearCategory() {
      if (this.data.busy || !this.data.categoryId) return;
      this.markDirty();
      this.setData({ categoryId: '', categoryName: '' });
    },

    onTopicsChange(e: WechatMiniprogram.CustomEvent<{ topics: PostTopic[] }>) {
      if (this.data.busy) return;
      this.markDirty();
      this.setData({ topics: e.detail.topics });
    },

    removeTopic(e: WechatMiniprogram.TouchEvent) {
      if (this.data.busy) return;
      this.markDirty();
      this.setData({ topics: this.data.topics.filter((x) => x.id !== e.currentTarget.dataset.id) });
    },

    onAddTopic() {
      if (this.data.busy || !this.data.organizationEnabled) return;
      void wx.hideKeyboard();
      this.setData({ showTopics: true });
    },

    onCloseTopics() {
      this.setData({ showTopics: false });
    },

    noop() {
      /* empty */
    },

    onKeyboardHeightChange(e: WechatMiniprogram.CustomEvent<{ height: number }>) {
      this.setData({ kbHeight: e.detail.height });
    },

    onTextareaFocus(e: WechatMiniprogram.CustomEvent<{ height: number }>) {
      this.setData({ focused: true, kbHeight: e.detail.height || 0 });
    },

    onTextareaBlur() {
      this.setData({ kbHeight: 0 });
    },

    onContentInput(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      if (this.data.busy) return;
      const val = e.detail.value;
      this._content = val.length > 1000 ? val.slice(0, 1000) : val;
      this.markDirty();
      if (this._mirrorTimer) clearTimeout(this._mirrorTimer);
      this._mirrorTimer = setTimeout(() => {
        const content = this._content;
        this.setData({
          mirrorContent: content + (content.endsWith('\n') ? ' ' : '\n '),
          contentLength: content.length,
          canSubmit:
            content.trim().length > 0 ||
            (POST_CAPABILITIES.communityV1 && this.data.images.length > 0),
        });
      }, 50);
    },

    async onAddImage() {
      if (this.data.busy || this.data.selecting) return;
      const remain = 9 - this.data.images.length;
      if (remain <= 0) return;
      const generation = this._generation;
      const owner = this._owner;
      this.setData({ selecting: true });
      try {
        const selectedFiles = await mediaAction.selectImages(remain);
        if (
          generation !== this._generation ||
          owner !== getCurrentIdentity().id ||
          !selectedFiles.length
        )
          return;
        const images = [...this.data.images, ...selectedFiles.map((file) => file.filePath)];
        this._selectedFiles = [...this._selectedFiles, ...selectedFiles];
        this.markDirty();
        this.setData({
          images,
          canSubmit: this._content.trim().length > 0 || POST_CAPABILITIES.communityV1,
        });
      } catch (err: unknown) {
        if (generation === this._generation) {
          log.error('onAddImage', '添加图片失败', err);
          notifyToast({ title: '添加图片失败', icon: 'none' });
        }
      } finally {
        if (generation === this._generation) this.setData({ selecting: false });
      }
    },

    onPreviewImage(e: WechatMiniprogram.TouchEvent) {
      if (this.data.busy) return;
      const current = this.data.images[Number(e.currentTarget.dataset.index)];
      if (current) void wx.previewImage({ current, urls: this.data.images });
    },

    onRemoveImage(e: WechatMiniprogram.TouchEvent) {
      if (this.data.busy) return;
      const { index } = e.currentTarget.dataset as { index: number };
      const removedPath = this.data.images[index];
      const images = this.data.images.filter((_, i) => i !== index);
      this._selectedFiles = this._selectedFiles.filter((file) => file.filePath !== removedPath);
      this.markDirty();
      this.setData({
        images,
        canSubmit:
          this._content.trim().length > 0 ||
          (POST_CAPABILITIES.communityV1 && images.length > 0),
      });
    },

    async onRequestClose() {
      if (this.data.busy || this.data.selecting) return;
      if (!this.data.dirty) {
        this.closeSheet();
        return;
      }
      const generation = this._generation;
      try {
        const result = await wxShowModal({
          title: '放弃编辑？',
          content: '内容尚未发布，确认放弃？',
          confirmText: '放弃',
          confirmColor: '#FF3B30',
          cancelText: '继续编辑',
        });
        if (generation !== this._generation || !result.confirm) return;
        this._leaveGuard?.(false);
        this.setData({ dirty: false });
        this.closeSheet();
      } catch {
        // Cancellation and native modal failures leave the editor untouched.
      }
    },

    onSubmit() {
      if (!this.data.canSubmit || this.data.busy || this.data.selecting) return;
      const content = this._content.trim();
      if (!content && !(POST_CAPABILITIES.communityV1 && this.data.images.length)) return;
      this.triggerEvent('submit', {
        content,
        selectedFiles: this._selectedFiles,
        ...(this.data.organizationEnabled
          ? {
              postType: 'NORMAL',
              categoryId: this.data.categoryId || null,
              topicIds: this.data.topics.map((topic) => topic.id),
            }
          : {}),
      });
    },

    resetContent(text = '') {
      this._content = text.slice(0, 1000);
      this.setData({
        content: this._content,
        mirrorContent: this._content + (this._content.endsWith('\n') ? ' ' : '\n '),
        contentLength: this._content.length,
        canSubmit:
          this._content.trim().length > 0 ||
          (POST_CAPABILITIES.communityV1 && this.data.images.length > 0),
        dirty: !!this._content,
      });
      this._leaveGuard?.(!!this._content);
    },
  },
});
