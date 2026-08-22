// components/post-edit-panel/index.ts
import { useSheet } from '../../behaviors/sheet-mixin';
import defineComponent from '../../utils/defineComponent';
import { createLogger } from '../../utils/logger';
import { notifyToast } from '../../utils/notify';
import type { SelectedMediaFile } from '../../actions/media';
import { mediaAction } from '../../actions/index';

const log = createLogger('PostEditPanel');

interface PostEditPanelPrivate {
  _content: string;
  _mirrorTimer: ReturnType<typeof setTimeout> | null;
  _uiTimer: ReturnType<typeof setTimeout> | null;
  _selectedFiles: SelectedMediaFile[];
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
  },

  data: {
    mirrorContent: '\n',
    content: '',
    images: [] as string[],
    canSubmit: false,

    kbHeight: 0,
    contentLength: 0,

    focused: false,
  },

  lifetimes: {
    // 每次 show=true 时父页面 wx:if 重新挂载组件，attached 必然触发
    attached() {
      // 私有字段初始化
      this._content = '';
      this._mirrorTimer = null;
      this._uiTimer = null;
      this._selectedFiles = [];

      this._uiTimer = setTimeout(() => {
        this.setData({
          focused: true,
        });
      }, 30);
    },

    detached() {
      if (this._mirrorTimer) {
        clearTimeout(this._mirrorTimer);
        this._mirrorTimer = null;
      }
      if (this._uiTimer) {
        clearTimeout(this._uiTimer);
        this._uiTimer = null;
      }
      this.setData({
        content: '',
        images: [],
        canSubmit: false,
        focused: false,
      });

      // 私有字段重置（以防万一，虽然下次 attached 会重新赋值）
      this._content = '';
      this._mirrorTimer = null;
      this._uiTimer = null;
      this._selectedFiles = [];
    },
  },

  methods: {
    noop() {
      /* empty */
    },

    // ─── 键盘处理 ────────────────────────────────────
    onKeyboardHeightChange(e: WechatMiniprogram.CustomEvent<{ height: number }>) {
      const kbH = e.detail.height;
      this.setData({
        kbHeight: kbH,
      });
    },

    onTextareaFocus(e: WechatMiniprogram.CustomEvent<{ height: number }>) {
      const kbH = e.detail.height || 0;
      this.setData({
        focused: true,
        kbHeight: kbH,
      });
    },

    onTextareaBlur() {
      this.setData({
        kbHeight: 0,
      });
    },

    // ── 正文 ──────────────────────────────────────────
    onContentInput(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      // 截断（防粘贴超限）
      const val = e.detail.value;
      this._content = val.length > 700 ? val.slice(0, 700) : val;
      // 镜像高度：50ms 防抖，停顿后才更新
      // 快速连续输入/长按删除期间不触发任何 setData
      if (this._mirrorTimer) {
        clearTimeout(this._mirrorTimer);
      }
      this._mirrorTimer = setTimeout(() => {
        const c = this._content;
        this.setData({
          mirrorContent: c + (c.endsWith('\n') ? ' ' : '\n '),
          contentLength: c.length,
          canSubmit: c.trim().length > 0,
        });
      }, 50);
    },

    // ── 图片 ──────────────────────────────────────────
    async onAddImage() {
      const remain = 9 - this.data.images.length;
      if (remain <= 0) return;

      try {
        const selectedFiles = await mediaAction.selectImages(remain);
        const newImgs = selectedFiles.map((f) => f.filePath);
        this.setData({
          images: [...this.data.images, ...newImgs],
        });
        // 确保 this._selectedFiles 已初始化为数组
        this._selectedFiles = [...this._selectedFiles, ...selectedFiles];
      } catch (err: unknown) {
        log.error('onAddImage', '添加图片失败', err);
        notifyToast({ title: '添加图片失败', icon: 'none' });
      }
    },

    onRemoveImage(e: WechatMiniprogram.TouchEvent) {
      const { index } = e.currentTarget.dataset as { index: number };

      const removedPath = this.data.images[index];

      const images = this.data.images.filter((_, i) => i !== index);

      const selectedFiles = this._selectedFiles.filter((f) => f.filePath !== removedPath);

      this.setData({
        images,
      });
      this._selectedFiles = selectedFiles;
    },

    // ── 发布 ──────────────────────────────────────────
    onSubmit() {
      if (!this.data.canSubmit) return;
      const content = this._content.trim();
      if (!content) return;
      const selectedFiles = this._selectedFiles;

      this.triggerEvent('submit', {
        content,
        selectedFiles,
      });
    },

    // ─── 需要程序化清空/回填时 ──────────────────────────
    resetContent(text = '') {
      this._content = text;
      // 一次性同步 textarea（非受控模式下唯一需要 value 的时刻）
      this.setData({
        content: text, // 仅用于这一次重置
        mirrorContent: text + (text.endsWith('\n') ? ' ' : '\n '),
        contentLength: text.length,
        canSubmit: text.trim().length > 0,
      });
      // 用完立刻解除绑定，避免后续输入被 data.content 覆盖
      // WeChat 不支持动态删除属性，但只要不再 setData content 就不会覆盖
    },
  },
});
