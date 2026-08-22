// subpkg_community/pages/post-edit/post-edit.ts

// 换为弹窗形式

import {
  wxGetWindowInfo,
  wxNavigateBack,
  wxOffKeyboardHeightChange,
  wxOnKeyboardHeightChange,
  wxShowActionSheet,
  wxShowModal,
} from '../../../utils/wx-promise';
import { mediaAction, postAction } from '../../../actions/index';
import type { SelectedMediaFile } from '../../../actions/media';
import { TARGET_TYPES } from '../../../utils/constants';
import { showErrorToast, showInfoToast, showSuccessToast } from '../../../utils/notify';

const VISIBILITY_OPTIONS = [
  { value: 'all', label: '所有人' },
  { value: 'followers', label: '仅关注者' },
  { value: 'self', label: '仅自己' },
];

Page({
  _openTimer: null as number | null,
  _closeTimer: null as number | null,
  _publishTimer: null as number | null,

  data: {
    // 动画状态
    ready: false, // 触发弹起动画
    closing: false, // 触发收起动画

    // 键盘 & 安全区
    keyboardHeight: 0,
    safeBottom: 0,
    bodyHeight: 0,

    // 表单
    content: '',
    images: [] as string[],
    selectedFiles: [] as SelectedMediaFile[],
    topics: [] as string[],
    visibility: 'all',
    visibilityLabel: '所有人',

    // 是否可以发布
    canSubmit: false,
    submitting: false,

    // 话题输入弹窗
    showTopicInput: false,
    topicInput: '',

    // 自动聚焦
    autoFocus: false,
  },

  onLoad() {
    const sys = wxGetWindowInfo();
    const safeBottom = sys.screenHeight - sys.safeArea.bottom;

    // 面板高度 92vh，内容区 = 面板 - 导航栏 - 工具栏
    const panelHeight = sys.windowHeight * 0.92;
    const navHeight = 56 + 16; // handle + nav
    const toolbarH = 72 + 12 * 2; // toolbar
    const bodyHeight = panelHeight - navHeight - toolbarH;

    this.setData({
      safeBottom,
      bodyHeight,
    });

    // 监听键盘
    wxOnKeyboardHeightChange((res) => {
      this.setData({
        keyboardHeight: res.height,
      });
    });

    // 延一帧触发弹起动画，让页面先渲染
    this._openTimer = setTimeout(() => {
      this._openTimer = null;
      this.setData({
        ready: true,
        autoFocus: true,
      });
    }, 50);
  },

  onUnload() {
    [this._openTimer, this._closeTimer, this._publishTimer].forEach((timer) => {
      if (timer !== null) clearTimeout(timer);
    });
    this._openTimer = null;
    this._closeTimer = null;
    this._publishTimer = null;
    wxOffKeyboardHeightChange();
  },

  // ─── 关闭 ────────────────────────────────────────────────
  onClose() {
    if (this.data.content || this.data.images.length) {
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
    const content = e.detail.value;
    this.setData({
      content,
      canSubmit: content.trim().length > 0,
    });
  },

  // ─── 图片 ────────────────────────────────────────────────
  async onAddImage() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;

    try {
      const selectedFiles = await mediaAction.selectImages(remain);
      this.setData({
        images: [...this.data.images, ...selectedFiles.map((file) => file.filePath)],
        selectedFiles: [...this.data.selectedFiles, ...selectedFiles],
      });
    } catch {
      /* 用户取消，不做处理 */
    }
  },

  onRemoveImage(e: WechatMiniprogram.TouchEvent) {
    const { index } = e.currentTarget.dataset as { index: number };
    const images = this.data.images.filter((_, i) => i !== index);
    const selectedFiles = this.data.selectedFiles.filter((_, i) => i !== index);
    this.setData({
      images,
      selectedFiles,
    });
  },

  // ─── 话题 ────────────────────────────────────────────────
  onAddTopic() {
    this.setData({
      showTopicInput: true,
      topicInput: '',
    });
  },

  onTopicInput(e: WechatMiniprogram.Input) {
    this.setData({
      topicInput: e.detail.value,
    });
  },

  onConfirmTopic() {
    const topic = this.data.topicInput.trim();
    if (!topic) {
      this.setData({
        showTopicInput: false,
      });
      return;
    }
    if (this.data.topics.includes(topic)) {
      showInfoToast('话题已存在');
      return;
    }
    if (this.data.topics.length >= 5) {
      showInfoToast('最多添加5个话题');
      return;
    }
    this.setData({
      topics: [...this.data.topics, topic],
      showTopicInput: false,
      topicInput: '',
    });
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
  },

  // ─── 可见范围 ────────────────────────────────────────────
  onPickVisibility() {
    void wxShowActionSheet({
      itemList: VISIBILITY_OPTIONS.map((o) => o.label),
    })
      .then((res) => {
        const selected = VISIBILITY_OPTIONS[res.tapIndex];
        this.setData({
          visibility: selected.value,
          visibilityLabel: selected.label,
        });
      })
      .catch(() => {
        // 用户取消选择，不处理。
      });
  },

  // ─── 收起键盘 ────────────────────────────────────────────
  onHideKeyboard() {
    void wx.hideKeyboard();
  },

  // ─── 发布 ────────────────────────────────────────────────
  async onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;

    const content = this.data.content.trim();
    if (!content) return;

    void wx.showLoading({
      title: '发布中...',
    });

    this.setData({ submitting: true });

    try {
      const attachmentItems =
        this.data.selectedFiles.length > 0
          ? await mediaAction.uploadAndSaveFiles(TARGET_TYPES.POST.value, this.data.selectedFiles)
          : [];
      const topicText = this.data.topics.map((topic) => `#${topic}`).join(' ');
      const finalContent = topicText ? `${content}\n${topicText}` : content;

      await postAction.publishPostAndSync({
        title: finalContent.slice(0, 30),
        content: finalContent,
        attachmentItems,
      });

      void wx.hideLoading();
      showSuccessToast('发布成功');

      // 延迟返回，让 toast 显示完
      if (this._publishTimer !== null) clearTimeout(this._publishTimer);
      this._publishTimer = setTimeout(() => {
        this._publishTimer = null;
        this._closePanel();
      }, 1500);
    } catch (err) {
      void wx.hideLoading();
      showErrorToast(err, {
        fallback: '发布失败，请稍后再试',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
