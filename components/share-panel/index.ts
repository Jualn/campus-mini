import { useSheet } from '../../behaviors/sheet-mixin';
import defineComponent from '../../utils/defineComponent';
import {
  wxAuthorize,
  wxGetSetting,
  wxOpenSetting,
  wxPreviewImage,
  wxSaveImageToPhotosAlbum,
  wxShowModal,
} from '../../utils/wx-promise';
import { notifyToast } from '../../utils/notify';

/** 生成状态由宿主页持有；图片解码、保存状态只属于面板。 */
defineComponent<{ _previewTimer?: number; _attached: boolean }>()({
  behaviors: [useSheet({ panelRatio: 0.9, preserveWxsExitAnimation: true })],
  properties: {
    shareImagePath: { type: String, value: '' },
    status: { type: String, value: 'idle' },
  },
  data: { imageLoaded: false, imageError: false, saving: false },
  lifetimes: {
    attached() {
      this._attached = true;
      this._watchPreview();
    },
    detached() {
      this._attached = false;
      this._clearPreviewTimer();
    },
  },
  observers: {
    'shareImagePath,status'() {
      this._watchPreview();
    },
  },
  methods: {
    _clearPreviewTimer() {
      if (this._previewTimer !== undefined) clearTimeout(this._previewTimer);
      this._previewTimer = undefined;
    },
    _watchPreview() {
      this._clearPreviewTimer();
      this.setData({ imageLoaded: false, imageError: false });
      if (this.properties.status === 'ready' && this.properties.shareImagePath) {
        this._previewTimer = setTimeout(() => {
          this._previewTimer = undefined;
          if (!this._attached) return;
          this.setData({ imageError: true });
          this.triggerEvent('previewerror');
        }, 8000);
      }
    },
    onImageLoad(e: WechatMiniprogram.CustomEvent) {
      if (e.currentTarget.dataset.path !== this.properties.shareImagePath) return;
      this._clearPreviewTimer();
      this.setData({ imageLoaded: true, imageError: false });
    },
    onImageError(e: WechatMiniprogram.CustomEvent) {
      if (e.currentTarget.dataset.path !== this.properties.shareImagePath) return;
      this._clearPreviewTimer();
      this.setData({ imageLoaded: false, imageError: true });
      this.triggerEvent('previewerror');
    },
    onRetry() {
      this.triggerEvent('retry');
    },
    async onPreviewImage() {
      if (!this.data.imageLoaded || this.properties.status !== 'ready') return;
      try {
        await wxPreviewImage({
          urls: [this.properties.shareImagePath],
          current: this.properties.shareImagePath,
        });
      } catch {
        notifyToast({ title: '预览失败，请重试', icon: 'none' });
      }
    },
    async onSaveImage() {
      if (this.data.saving || !this.data.imageLoaded || this.properties.status !== 'ready') return;
      const filePath = this.properties.shareImagePath;
      this.setData({ saving: true });
      try {
        const setting = await wxGetSetting({});
        if (!setting.authSetting['scope.writePhotosAlbum']) {
          try {
            await wxAuthorize({ scope: 'scope.writePhotosAlbum' });
          } catch {
            const modal = await wxShowModal({
              title: '需要相册权限',
              content: '请在设置中开启相册权限，以保存图片',
              confirmText: '去设置',
            });
            if (!modal.confirm) return;
            const updated = await wxOpenSetting();
            if (!updated.authSetting['scope.writePhotosAlbum']) return;
          }
        }
        await wxSaveImageToPhotosAlbum({ filePath });
        notifyToast({ title: '已保存到相册', icon: 'success' });
      } catch {
        notifyToast({ title: '保存失败，请重试', icon: 'none' });
      } finally {
        if (this._attached) this.setData({ saving: false });
      }
    },
  },
});
