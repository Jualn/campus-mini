// share-popup.ts
import { useSheet } from '../../behaviors/sheet-mixin';
import defineComponent from '../../utils/defineComponent';
import type {} from '../../types/business';
import { createLogger } from '../../utils/logger';
import {
  wxAuthorize,
  wxGetSetting,
  wxOpenSetting,
  wxPreviewImage,
  wxSaveImageToPhotosAlbum,
  wxSetClipboardData,
  wxShowModal,
} from '../../utils/wx-promise';
import { notifyToast } from '../../utils/notify';

const log = createLogger('SharePanel');

defineComponent()({
  behaviors: [useSheet()],
  /**
   * ─── 外部属性 ───────────────────────────────────────────────────
   * sharePath       String    分享路径（复制链接是使用）
   * shareImagePath  String    用来展示 canvas 生成的临时图片的路径，空则不展示预览区
   */
  properties: {
    sharePath: {
      type: String,
      value: '',
    },
    shareImagePath: {
      type: String,
      value: '',
    },
  },

  data: {
    imageLoaded: false,

    panelRatio: 0.8,
  },

  lifetimes: {},

  methods: {
    noop() {
      /* empty */
    },

    /* ── 图片加载回调 ── */
    onImageLoad() {
      this.setData({
        imageLoaded: true,
      });
    },

    onImageError(e: WechatMiniprogram.TouchEvent) {
      log.warn('onImageError', '预览图加载失败', e);
      this.setData({
        imageLoaded: true,
      }); // 也隐藏骨架屏
    },

    /* ── 查看大图 ── */
    onPreviewImage() {
      const { shareImagePath } = this.properties;
      if (!shareImagePath) return;
      void wxPreviewImage({
        urls: [shareImagePath],
        current: shareImagePath,
      });
    },

    /* ── 保存图片到相册 ── */
    async onSaveImage() {
      const { shareImagePath } = this.properties;
      if (!shareImagePath) return;

      const doSave = () => {
        void wxSaveImageToPhotosAlbum({
          filePath: shareImagePath,
        })
          .then(() => {
            notifyToast({
              title: '已保存到相册',
              icon: 'success',
            });
          })
          .catch((err: unknown) => {
            log.error('onSaveImage', '保存失败', err);
            notifyToast({
              title: '保存失败，请重试',
              icon: 'error',
            });
          });
      };

      // 先检查授权
      const setting = await wxGetSetting({});

      if (setting.authSetting['scope.writePhotosAlbum']) {
        doSave();
        return;
      }

      try {
        await wxAuthorize({
          scope: 'scope.writePhotosAlbum',
        });

        doSave();
      } catch {
        const modal = await wxShowModal({
          title: '需要相册权限',
          content: '请在设置中开启相册权限，以保存图片',
          confirmText: '去设置',
        });

        if (modal.confirm) {
          await wxOpenSetting();
        }
      }
    },

    /* ── 复制链接 ── */
    onCopyLink() {
      const { sharePath } = this.properties;
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const route = currentPage.route || '';
      const fullPath = sharePath || `/${route}`;

      void wxSetClipboardData({
        data: fullPath,
      }).then(() => {
        notifyToast({
          title: '链接已复制',
          icon: 'success',
        });
        this.triggerEvent('share', {
          type: 'copyLink',
          path: fullPath,
        });
      });
    },
  },
});
