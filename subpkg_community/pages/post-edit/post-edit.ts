// subpkg_community/pages/post-edit/post-edit.ts

// 换为弹窗形式

import {
  chooseImages,
  wxGetWindowInfo,
  wxNavigateBack,
  wxOffKeyboardHeightChange,
  wxOnKeyboardHeightChange,
  wxShowModal,
} from '../../../utils/wx-promise';
import type { PostEditData } from '../../../types/business';

const VISIBILITY_OPTIONS = [
  { value: 'all', label: '所有人' },
  { value: 'followers', label: '仅关注者' },
  { value: 'self', label: '仅自己' },
];

Page({
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
    images: [],
    topics: [],
    visibility: 'all',
    visibilityLabel: '所有人',

    // 是否可以发布
    canSubmit: false,

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
    setTimeout(() => {
      this.setData({
        ready: true,
        autoFocus: true,
      });
    }, 50);
  },

  onUnload() {
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
    setTimeout(() => void wxNavigateBack(), 300);
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
  onAddImage() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;
    chooseImages({ count: remain })
      .then((newImages) => {
        this.setData({
          images: [...this.data.images, ...newImages],
        });
      })
      .catch(() => {
        /* 用户取消，不做处理 */
      });

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res: any) => {
        const newImages = res.tempFiles.map((f: any) => f.tempFilePath);
        this.setData({
          images: [...this.data.images, ...newImages],
        });
      },
    });
  },

  onRemoveImage(e: any) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({
      images,
    });
  },

  // ─── 话题 ────────────────────────────────────────────────
  onAddTopic() {
    this.setData({
      showTopicInput: true,
      topicInput: '',
    });
  },

  onTopicInput(e: any) {
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
      wx.showToast({
        title: '话题已存在',
        icon: 'none',
      });
      return;
    }
    if (this.data.topics.length >= 5) {
      wx.showToast({
        title: '最多添加5个话题',
        icon: 'none',
      });
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

  onRemoveTopic(e: any) {
    const topics = this.data.topics.filter((_, i) => i !== e.currentTarget.dataset.index);
    this.setData({
      topics,
    });
  },

  // ─── 可见范围 ────────────────────────────────────────────
  onPickVisibility() {
    wx.showActionSheet({
      itemList: VISIBILITY_OPTIONS.map((o) => o.label),
      success: (res: any) => {
        const selected = VISIBILITY_OPTIONS[res.tapIndex];
        this.setData({
          visibility: selected.value,
          visibilityLabel: selected.label,
        });
      },
    });
  },

  // ─── 收起键盘 ────────────────────────────────────────────
  onHideKeyboard() {
    wx.hideKeyboard();
  },

  // ─── 发布 ────────────────────────────────────────────────
  onSubmit() {
    if (!this.data.canSubmit) return;

    wx.showLoading({
      title: '发布中...',
    });

    // 真实场景：先上传图片到 OSS，再提交帖子
    // uploadImages(images).then(urls => wx.request({ url: '/api/post', method: 'POST', data: { content, images: urls, topics, visibility } }))

    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success',
      });

      // 通知首页刷新
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && (prevPage as any).onRefresh) {
        (prevPage as any).onRefresh();
      }

      // 延迟返回，让 toast 显示完
      setTimeout(() => this._closePanel(), 1500);
    }, 800);
  },
});
