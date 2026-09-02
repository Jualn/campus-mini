// 分包本地副本；修改时同步其他分包同名文件，audit:packages 会校验一致性。
import { ROUTES } from '../../utils/routes';
import { wxNavigateBack, wxReLaunch } from '../../utils/wx-promise';

/** 有上一页时返回；分享卡片等外部直达场景则重建首页。 */
export function navigateBackOrHome(): void {
  if (getCurrentPages().length > 1) {
    void wxNavigateBack();
    return;
  }

  void wxReLaunch({ url: ROUTES.HOME });
}
