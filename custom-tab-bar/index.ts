import eventBus, { EVENTS } from '../utils/event-bus';
import { wxPageScrollTo, wxSwitchTab } from '../utils/wx-promise';
import defineComponent from '../utils/defineComponent';
import { getUnreadCount } from '../services/notification-center';

/**
 * 自定义 TabBar 组件接口
 */
export interface CustomTabBar {
  /**
   * 初始化：在页面 onShow 中调用，确保正确设置 selected 索引
   * @example
   * 用法：getCustomTabBar(this).init()
   */
  init(): void;
  /**
   * 外部调用：控制 TabBar 显隐
   * @param isVisible
   * @example
   * 用法：getCustomTabBar(this).toggleVisible(true)
   */
  toggleVisible(Visible: boolean): void;
  /**
   * 更新徽标数（0 表示隐藏）
   * @param tabIndex Tab 索引
   * @param count 徽标数
   * @example
   * 用法：getCustomTabBar(this).setBadge(1, 5)
   */
  setBadge(tabIndex: number, count: number): void;
}

interface Private {
  /**
   *  监听未读消息数变化，更新消息 Tab 徽标
   *
   * @param unreadCount 未读消息数
   * @returns void
   */
  unreadListener: (unreadCount: number) => void;
}

// custom-tab-bar/index.js
defineComponent<Private>()({
  data: {
    selected: 0,
    isTabBarVisible: true,

    // Tab 配置：两张图片对应未选中 / 选中状态
    tabList: [
      {
        text: '首页',
        url: '/pages/index/index',
        icon: '/images/tabbar/home.svg',
        iconActive: '/images/tabbar/home-active.svg',
      },
      {
        text: '消息',
        url: '/pages/message/message',
        icon: '/images/tabbar/message.svg',
        iconActive: '/images/tabbar/message-active.svg',
        badge: 0,
      },
      {
        text: '我的',
        url: '/pages/me/me',
        icon: '/images/tabbar/user.svg',
        iconActive: '/images/tabbar/user-active.svg',
      }
      // {
      //   text: '测试',
      //   url: '/pages/test/test',
      // },
    ],
  },

  lifetimes: {
    attached() {
      // 初始化
      this.setBadge(1, getUnreadCount());

      this.unreadListener = (unreadCount: number) => {
        this.setBadge(1, unreadCount);
      };
      eventBus.on(EVENTS.NOTIFY_UNREAD_CHANGE, this.unreadListener);
    },
    detached() {
      eventBus.off(EVENTS.NOTIFY_UNREAD_CHANGE, this.unreadListener);
    },
  },

  methods: {
    init() {
      const page = getCurrentPages().pop() as WechatMiniprogram.Page.TrivialInstance;
      this.setData({
        selected: this.data.tabList.findIndex((item) => item.url === `/${page.route}`),
      });
    },

    // 点击 Tab：当前页再点 → 回顶部
    handleTabTap(e: WechatMiniprogram.TouchEvent) {
      const { index } = e.currentTarget.dataset as { index: number };

      if (index === this.data.selected) {
        void wxPageScrollTo({
          scrollTop: 0,
          duration: 300,
        });
        return;
      }

      void wxSwitchTab({
        url: this.data.tabList[index].url,
      });
    },

    toggleVisible(isVisible: boolean) {
      this.setData({
        isTabBarVisible: isVisible,
      });
    },

    setBadge(tabIndex: number, count: number) {
      this.setData({
        [`tabList[${String(tabIndex)}].badge`]: count,
      });
    },
  },
});
