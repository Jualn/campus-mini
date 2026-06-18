// utils/tabbar.ts

import type { CustomTabBar } from '../custom-tab-bar';

export function getCustomTabBar(
  page: WechatMiniprogram.Page.Instance<AnyObject, AnyObject>,
): CustomTabBar {
  return page.getTabBar() as unknown as CustomTabBar;
}
