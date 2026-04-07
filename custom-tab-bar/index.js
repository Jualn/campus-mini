// custom-tab-bar/index.js

Component({
  data: {
    selected: 0,
    isTabBarVisible: true,

    // Tab 配置：两张图片对应未选中 / 选中状态
    tabList: [{
        text: '首页',
        url: '/pages/index/index',
        icon: '/images/tabbar/home.svg',
        iconActive: '/images/tabbar/home-active.svg'
      },
      {
        text: '消息',
        url: '/pages/message/message',
        icon: '/images/tabbar/message.svg',
        iconActive: '/images/tabbar/message-active.svg',
        badge: 10
      },
      {
        text: '我的',
        url: '/pages/me/me',
        icon: '/images/tabbar/user.svg',
        iconActive: '/images/tabbar/user-active.svg'
      },
      {
        text: '测试',
        url: '/pages/test/test'
      }
    ]
  },

  lifetimes: {
    attached() {
      
    },
  },

  methods: {
    init() {
      const page = getCurrentPages().pop();
      this.setData({
        selected: this.data.tabList.findIndex(item => item.url === `/${page.route}`)
      });
    },

    // 点击 Tab：当前页再点 → 回顶部；否则保存滚动位置后跳转
    handleTabTap(e) {
      const {
        index
      } = e.currentTarget.dataset

      if (index === this.data.selected) {
        wx.pageScrollTo({
          scrollTop: 0,
          duration: 300
        })
        return
      }

      // 保存当前页滚动位置
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const app = getApp()
      if (!app.globalData) app.globalData = {}
      if (!app.globalData.scrollTops) app.globalData.scrollTops = {}
      app.globalData.scrollTops[currentPage.route] =
        currentPage.data._currentScrollTop || 0

      wx.switchTab({
        url: this.data.tabList[index].url
      })
    },

    // 外部调用：控制 TabBar 显隐
    // 用法：this.getTabBar?.()?.toggleVisible(false)
    toggleVisible(isVisible) {
      this.setData({
        isTabBarVisible: isVisible
      })
    },

    // 外部调用：更新徽标数（0 表示隐藏）
    // 用法：this.getTabBar?.()?.setBadge(1, 5)
    setBadge(tabIndex, count) {
      this.setData({
        [`tabList[${tabIndex}].badge`]: count
      })
    }
  }
})