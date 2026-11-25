import { wxSwitchTab } from '../../../utils/wx-promise';
// 保留既有分享入口，统一返回新的栏目首页。
Page({
  onLoad() {
    void wxSwitchTab({ url: '/pages/index/index' });
  },
  onShareAppMessage() {
    return { title: 'e 网同心', path: '/pages/index/index' };
  },
});
