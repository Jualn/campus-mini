const MOCK_EXAMS = [{
    id: 'cet4',
    name: '英语四级',
    icon: '📖',
    color: 'blue',
    category: 'language',
    tagline: '教育部主办的全国大学英语水平测试',
    frequency: '每年6月、12月各一次',
    currentTerm: {
      enrollStart: '',
      enrollEnd: '',
      examDate: '2026-06-13',
      admitDate: '',
      resultDate: '',
    },
  },
  {
    id: 'cet6',
    name: '英语六级',
    icon: '📗',
    color: 'blue',
    category: 'language',
    tagline: '教育部主办的全国大学英语水平测试',
    frequency: '每年6月、12月各一次',
    currentTerm: {
      enrollStart: '',
      enrollEnd: '',
      examDate: '2026-06-13',
      admitDate: '',
      resultDate: '',
    },
  },
  {
    id: 'putonghua',
    name: '普通话水平测试',
    icon: '🗣️',
    color: 'orange',
    category: 'language',
    tagline: '教育部语言文字工作委员会组织的普通话等级测试',
    frequency: '各地全年滚动安排，以当地通知为准',
    currentTerm: {
      enrollStart: '',
      enrollEnd: '',
      examDate: '',
      admitDate: '',
      resultDate: '',
    },
  },
  {
    id: 'ncre',
    name: '全国计算机等级考试',
    icon: '💻',
    color: 'purple',
    category: 'computer',
    tagline: '教育部考试中心主办的计算机应用能力考试',
    frequency: '每年3月、9月各一次',
    currentTerm: {
      enrollStart: '',
      enrollEnd: '',
      examDate: '',
      admitDate: '',
      resultDate: '',
    },
  },
  {
    id: 'teacher',
    name: '教师资格证',
    icon: '🏫',
    color: 'green',
    category: 'certificate',
    tagline: '教育部统一组织的教师职业资格认定考试',
    frequency: '笔试每年3月、11月各一次',
    currentTerm: {
      enrollStart: '',
      enrollEnd: '',
      examDate: '',
      admitDate: '',
      resultDate: '',
    },
  },
  {
    id: 'kaoyan',
    name: '全国硕士研究生考试',
    icon: '🎓',
    color: 'red',
    category: 'graduate',
    tagline: '教育部主管的全国统一硕士研究生招生考试',
    frequency: '每年12月下旬，10月开放报名',
    currentTerm: {
      enrollStart: '',
      enrollEnd: '',
      examDate: '',
      admitDate: '2025-12-14',
      resultDate: '',
    },
  },
]

function findExamDate(timeline) {
  // 优先级：笔试 > 初试 > 考试 > 测试
  // 明确排除面试、口试、复试
  const priority = ['笔试', '初试', '考试', '测试']
  const exclude = ['面试', '口试', '复试']

  for (const keyword of priority) {
    const item = timeline.find(t =>
      t.date &&
      t.label.includes(keyword) &&
      !exclude.some(ex => t.label.includes(ex))
    )
    if (item) return item.date
  }
  return ''
}

function calcDaysLeft(dateStr, nowTs = Date.now()) {
  if (!dateStr) return 0
  const target = new Date(dateStr).getTime()
  if (Number.isNaN(target)) return 0
  const diff = Math.ceil((target - nowTs) / 86400000)
  return diff > 0 ? diff : 0
}

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,

    posts: [],
    activities: [],
    examList: [],

    showPopup: false,
    popupType: '', // 'comment' | 'share' | ...
    currentPostId: '',
    currentCommentCount: 0,

    activePostId: '',
    activePostCommentCount: 0,

    // 锁页用：记录锁定时的滚动位置
    lockScrollTop: 0,
    _isPreviewingImage: false,

    // FAB
    fabOpen: false,
    canPublishActivity: false, // 后端返回权限后设置
    fabBottomDock: 0,
    fabMenuBottom: 0,

    // 新增：同步 tabbar 的可见性状态（可选）
    tabBarHidden: false,

    currentShareImage: '',
    currentSharePath: '',
  },
  noop() {},

  _loadExamCountdown() {
    const app = getApp()
    const nowTs = Date.now()

    app.getExamTimelines((timelines) => {
      const examList = MOCK_EXAMS
        .map(e => {
          const tl = timelines[e.id] || []
          // timeline 有数据用动态，没有用静态兜底
          const examDate = tl.length ? findExamDate(tl) : (e.currentTerm?.examDate || '')
          const daysLeft = calcDaysLeft(examDate, nowTs)
          return {
            id: e.id,
            name: e.name, // 来自本地静态
            icon: e.icon, // 来自本地静态
            color: e.color, // 来自本地静态
            date: examDate, // 来自动态 timeline（或静态兜底）
            days: daysLeft, // 前端计算
          }
        })
        .filter(e => e.days > 0)
        .sort((a, b) => a.days - b.days)
        .slice(0, 5)

      this.setData({
        examList
      })
    })
  },

  _loadData() {
    const mockPosts = [{
        id: 0,
        nickname: "你发方稍等发发的",
        avatar: "/images/1760004163342.jpg",
        content: "今天在二食堂发现了人一起去打卡吗？🍱",
        images: [],
        commentCount: 8,
        likeCount: 21,
        isLiked: false,
        createdAt: "2025年12月31日"
      }, {
        id: 1,
        nickname: "你发生的及思念对方稍等发发的",
        avatar: "/images/1760004163342.jpg",
        content: "今天在二食堂发现了一家超级好吃的窗口！有人一起去打卡吗？🍱",
        images: ["/images/1760004156926.jpg"],
        commentCount: 8,
        likeCount: 21,
        isLiked: false,
        createdAt: "2025年12月31日"
      },
      {
        id: 2,
        nickname: "爱写Bug的学长",
        avatar: "",
        content: "今图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！打卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg"],
        time: "10分钟前",
        commentCount: 21,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 3,
        nickname: "不写Bug的学长",
        avatar: "",
        content: "今天图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004163342.jpg"],
        time: "10分钟前",
        commentCount: 13,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 4,
        nickname: "不爱Bug的学长",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
        content: "今天图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！打卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004163342.jpg", "/images/1760004163342.jpg"],
        time: "10分钟前",
        commentCount: 2,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 5,
        nickname: "不爱写Bug学长",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
        content: "今图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！去打卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg"],
        time: "10分钟前",
        commentCount: 50,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 6,
        nickname: "不爱写Bug的长",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
        content: "今天在二食堂发现了一图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！起去打卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004156926.jpg"],
        time: "10分钟前",
        commentCount: 30,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 7,
        nickname: "写Bug的学",
        avatar: "",
        content: "图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！有人一起去打卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg"],
        time: "10分钟前",
        commentCount: 22,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 8,
        nickname: "kgf",
        avatar: "",
        content: "今图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg"],
        time: "10分钟前",
        commentCount: 32,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      },
      {
        id: 9,
        nickname: "长sdgsd",
        avatar: "",
        content: "今天图书馆五楼今天终于有位置了！！！期末周真的太难抢了，附上我的幸运座位照 📚 大家加油备考，我们都是最棒的！卡吗？🍱",
        images: ["/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg", "/images/1760004163342.jpg", "/images/1760004156926.jpg"],
        time: "10分钟前",
        commentCount: 8,
        likeCount: 21,
        isLiked: false,
        createdAt: "10分钟前"
      }
    ];
    const mockActs = [{
        id: 1,
        title: "草坪音乐节",
        poster: "/images/1760004156926.jpg"
      },
      {
        id: 2,
        title: "校园黑客马拉松",
        poster: "/images/1760004163342.jpg"
      },
      {
        id: 3,
        title: "马拉松",
        poster: "/images/1760004163342.jpg"
      },
      {
        id: 4,
        title: "校园",
        poster: "/images/1760004163342.jpg"
      }
    ];

    this.setData({
      posts: mockPosts,
      activities: mockActs,
    })
    this._loadExamCountdown()
  },

  _openPopup(patch) {
    const scrollTop = this._currentScrollTop || 0
    this._setTabBarHidden(true)
    this.setData({
      ...patch,
      lockScrollTop: scrollTop, // 当出现弹窗时锁定页面位置，以免发送滚动
      showPopup: true
    })
  },

  _closePopup(resetType = false) {
    const patch = {
      showPopup: false
    }
    if (resetType) patch.popupType = ''
    this._setTabBarHidden(false)
    this.setData(patch)
  },

  // ==== 新增：封装方法，统一控制 TabBar 显示/隐藏，避免重复调用 ====
  _setTabBarHidden(hidden) {
    // hidden: true -> 隐藏 tabbar ; false -> 显示 tabbar
    const tabBar = typeof this.getTabBar === 'function' && this.getTabBar()

    if (!tabBar) {
      // 没有 tabbar （比如子包/调试环境）则跳过
      this._tabBarHidden = !!hidden
      this.setData({
        tabBarHidden: !!hidden
      })
      return
    }
    // 避免重复调用同样的状态
    if (this._tabBarHidden === !!hidden) return

    this._tabBarHidden = !!hidden
    // toggleTabBarVisibility 参数是 visible(boolean)
    tabBar.toggleVisible(!hidden)
    // 同步到 data（可供样式或调试使用）
    this.setData({
      tabBarHidden: !!hidden
    })
  },

  /**
   * 保留当前页面位置，再离开页面前使用，用于恢复离开时的页面所处位置
   */
  _saveCurrentScrollTop() {
    const app = getApp()
    if (!app.globalData.scrollTops) app.globalData.scrollTops = {}
    app.globalData.scrollTops['pages/index/index'] = this._currentScrollTop || 0
  },

  _navigateTo(url) {
    this._saveCurrentScrollTop()
    wx.navigateTo({
      url
    })
  },

  /**
   * 通过滑动位置控制tabbar显示隐藏,上下滑动隐藏/展示 tabbar 的逻辑
   * @param {number} current 当前滚动位置
   */
  _handleTabbarByScroll(current) {
    // 初始化上次 scrollTop
    if (typeof this._lastScrollTop === 'undefined' || this._lastScrollTop === null) {
      this._lastScrollTop = current
      return
    }

    const SCROLL_THRESHOLD = 20 // 像素阈值，避免细微抖动触发
    const delta = current - this._lastScrollTop

    // 更新 last 值供下一次计算
    this._lastScrollTop = current

    if (Math.abs(delta) < SCROLL_THRESHOLD) return

    // 向下滚动（delta > 0）且滚过一定距离后隐藏 tabbar
    if (delta > 0 && current > 50) {
      this._setTabBarHidden(true)
      return
    }

    // 向上滚动（delta < 0）时显示 tabbar（无论是否接近顶部）
    if (delta < 0) {
      this._setTabBarHidden(false)
      return
    }
  },

  onLoad() {
    this._currentScrollTop = 0

    // 初始化用于判断滚动方向的上一次位置和 tabbar 状态
    this._lastScrollTop = 0
    this._tabBarHidden = false

    // 计算 FAB 的两个位置
    const sys = wx.getWindowInfo()
    const safeBottom = sys.screenHeight - (sys.safeArea?.bottom ?? sys.screenHeight)

    // 胶囊实际高度（rpx 转 px）
    // 胶囊内容区 96rpx + 上下 padding 12rpx*2 = 120rpx
    // rpx -> px: 设备宽度 / 750
    const rpxRatio = sys.windowWidth / 750
    const tabBarHeight = Math.round(120 * rpxRatio) // 胶囊自身高度（px）
    // 胶囊离底部距离 = 安全区 + 16px 悬空
    const tabBarBottom = safeBottom + 16

    // FAB bottom = 胶囊离底 + 胶囊高度 + 与胶囊的间距 16px
    const fabBottomDock = tabBarBottom + tabBarHeight + 16

    const fabSize = 50 // FAB 直径约50px
    const fabMenuBottom = fabBottomDock + fabSize + 16 // menu底部 = FAB顶部 + 16px间距

    // 获取系统胶囊位置，适配自定义导航栏
    const menuButton = wx.getMenuButtonBoundingClientRect()
    this.setData({
      fabBottomDock,
      fabMenuBottom,
      canPublishActivity: false,

      statusBarHeight: sys.statusBarHeight,
      navHeight: menuButton.bottom + 10,
    })

    this._loadData()
  },

  onUnload() {
    this._saveCurrentScrollTop()
  },

  onHide() {
    this._saveCurrentScrollTop()
  },

  onPullDownRefresh() {
    if (this.data.showPopup) {
      // 弹窗开着，不执行刷新，直接停止
      wx.stopPullDownRefresh()
      return
    }
  },

  onShow() {
    // ✅ 页面显示时，初始化 tabbar 状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }

    // using the in-memory _currentScrollTop (which was correct at preview time)
    if (this._isPreviewingImage) {
      this._isPreviewingImage = false
      const top = this._currentScrollTop || 0
      // Delay slightly to let the page fully re-paint after preview closes
      setTimeout(() => {
        wx.pageScrollTo({
          scrollTop: top,
          duration: 0
        })
      }, 50)
      return // skip globalData restoration below
    }

    // ✅ 恢复离开时的滚动位置
    const app = getApp()
    const savedTop = app.globalData.scrollTops && app.globalData.scrollTops['pages/index/index']
    if (typeof savedTop === 'number') {
      wx.pageScrollTo({
        scrollTop: savedTop,
        duration: 0 // 无动画，瞬间恢复
      })
    }
  },

  onShareAppMessage() {
    return {
      imageUrl: this.data.currentShareImage,
      path: this.data.currentSharePath
    }
  },

  // ✅ 实时追踪滚动位置，避免异步读取的时序问题
  onPageScroll(e) {
    // 弹窗打开时不更新，避免 fixed 定位触发的滚动干扰
    // 不在弹窗打开时切换 tabbar（避免干扰）
    if (this.data.showPopup) return

    // 在没有打开弹窗时，执行以下操作
    this._currentScrollTop = e.scrollTop
    this._handleTabbarByScroll(e.scrollTop)
  },

  notifyPreviewImage() {
    this._isPreviewingImage = true
  },

  // 打开评论弹窗
  onOpenComment(e) {
    const {
      postId,
      commentCount
    } = e.detail
    wx.hideKeyboard()
    this._openPopup({
      currentPostId: postId,
      currentCommentCount: commentCount,
      popupType: 'comment',
    })
  },

  onOpenShare(e) {
    const {
      sharePath,
      shareImage
    } = e.detail

    this._openPopup({
      popupType: "share",
      currentSharePath: sharePath,
      currentShareImage: shareImage,
    })
  },

  onShareImageReady(e) {
    this.setData({
      currentShareImage: e.detail.shareImage
    })
  },

  onShareClose() {
    this._closePopup()
  },

  onCommentClose() {
    this._closePopup()
  },

  onCommentCountChange(e) {
    const {
      count
    } = e.detail
    const idx = this.data.posts.findIndex(p => p.id === this.data.activePostId)
    const patch = {
      activePostCommentCount: count
    }
    if (idx !== -1) {
      patch[`posts[${idx}].commentCount`] = count
    }
    this.setData(patch)
  },

  onPopupBeforeLeave() {
    wx.hideKeyboard()
  },

  onPopupLeave() {
    this._closePopup(true)
  },

  onPopupAfterLeave() {
    const scrollTop = this.data.lockScrollTop
    wx.pageScrollTo({
      scrollTop,
      duration: 0
    })
  },

  onOverlayTap() {
    this._closePopup()
  },

  onPostTap(e) {
    this._navigateTo(`/subpkg_community/pages/detail/detail?postId=${e.detail.postId}`)
  },

  onPostUser(e) {
    this._navigateTo(`/subpkg_user/pages/user/user?userId=${e.detail.userId}`)
  },

  onPostLike(e) {
    const {
      postId,
      isLiked
    } = e.detail
    const idx = this.data.posts.findIndex(p => p.id === postId)
    if (idx === -1) return
    const post = this.data.posts[idx]
    this.setData({
      [`posts[${idx}].isLiked`]: !isLiked,
      [`posts[${idx}].likeCount`]: post.likeCount + (isLiked ? -1 : 1),
    })
  },

  onPostEditClose() {
    this._closePopup()
  },

  onPostSubmit() {
    this._closePopup(true)
    wx.showToast({
      title: '发布成功',
      icon: 'success'
    })
  },

  onTapFab() {
    const {
      canPublishActivity,
      fabOpen
    } = this.data
    if (!canPublishActivity) {
      this.onPublishPost()
      return
    }
    this.setData({
      fabOpen: !fabOpen
    })
  },

  onCloseFab() {
    this.setData({
      fabOpen: false
    })
  },

  onPublishPost() {
    wx.hideKeyboard()

    this._openPopup({
      fabOpen: false,
      popupType: 'post-edit'
    })
  },

  onPublishActivity() {
    this.setData({
      fabOpen: false
    })
    this._navigateTo('/subpkg_activity/pages/publish/index')
  },

  goToActivityList() {
    this._navigateTo(`/subpkg_activity/pages/list/list`)
  },

  goToExamList() {
    this._navigateTo(`/subpkg_exam/pages/list/list`)
  },

  goToExamDetail(e) {
    this._navigateTo(`/subpkg_exam/pages/detail/detail?examId=${e.currentTarget.dataset.id}`)
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    this._navigateTo(`/subpkg_community/pages/detail/index?id=${id}`)
  },

  goToPost() {
    this._navigateTo('/subpkg_community/pages/post-edit/index')
  }
})