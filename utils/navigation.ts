import { ROUTES } from './routes';
import { wxNavigateBack, wxReLaunch } from './wx-promise';

/** 有上一页时返回；分享卡片等外部直达场景则重建首页。 */
export function navigateBackOrHome(): void {
  if (getCurrentPages().length > 1) {
    void wxNavigateBack();
    return;
  }

  void wxReLaunch({ url: ROUTES.HOME });
}
