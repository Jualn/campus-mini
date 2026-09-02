import defineBehavior from '../utils/defineBehavior';
import type { WxScope } from '../utils/share_poster/posterCanvas';
import { ShareTask, type ShareStatus } from '../utils/share_poster/shareTask';
import { createLogger } from '../utils/logger';

const log = createLogger('useSharePoster');

interface ShareRequest {
  /** 包含内容版本，避免同一条内容更新后继续使用旧图。 */
  key: string;
  path: string;
  /** 不传时沿用微信默认标题，适合正文已经排在图片中的帖子。 */
  title?: string;
  render: (scope: WxScope) => Promise<string>;
}

interface SharePrivate {
  _shareTask: ShareTask | null;
  _shareRequest: ShareRequest | null;
}

/** 只管理生成状态与分享内容，不决定业务模板和弹窗开关。 */
export function useSharePoster() {
  return defineBehavior<SharePrivate>()({
    data: {
      currentSharePath: '',
      currentShareTitle: '',
      currentShareImage: '',
      shareStatus: 'idle' as ShareStatus,
    },
    lifetimes: {
      attached() {
        this._shareTask = new ShareTask();
        this._shareRequest = null;
      },
      detached() {
        this._shareTask?.dispose();
        this._shareTask = null;
        this._shareRequest = null;
      },
    },
    methods: {
      _prepareShare(request: ShareRequest) {
        if (this._shareRequest?.key === request.key && this.data.shareStatus !== 'error') return;
        this._shareRequest = request;
        this.setData({ currentSharePath: request.path, currentShareTitle: request.title ?? '' });
        this._generateSharePoster();
      },
      _generateSharePoster() {
        const request = this._shareRequest;
        if (!request || !this._shareTask) return;
        this._shareTask.run(
          () => request.render(this),
          (shareStatus, currentShareImage) => {
            this.setData({ shareStatus, currentShareImage });
          },
          (error) => {
            log.error('_generateSharePoster', '分享图片生成失败', {
              page: request.path.split('?')[0],
              message: error instanceof Error ? error.message : String(error),
            });
          },
        );
      },
      onSharePreviewError() {
        this.setData({ shareStatus: 'error', currentShareImage: '' });
      },
      onRetryShare() {
        if (this.data.shareStatus === 'loading') return;
        this._generateSharePoster();
      },
      _getShareContent(): WechatMiniprogram.Page.ICustomShareContent {
        return {
          ...(this.data.currentShareTitle ? { title: this.data.currentShareTitle } : {}),
          path: this.data.currentSharePath || '/pages/index/index',
          // 右上角分享不受面板按钮控制：未就绪时使用固定封面，不能取上一条图片。
          imageUrl:
            this.data.shareStatus === 'ready'
              ? this.data.currentShareImage
              : 'https://cos.jualn.cn/share/index-share.jpg',
        };
      },
    },
  });
}
