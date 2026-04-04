// pages/me/index.js
Page({
  data: {
    statusBarHeight: 20,
    activeTab: 'posts',
    userInfo: {
      nickname: '不爱写Bug的学长',
      handle: 'bugfree_senior',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
      bannerUrl: '',
      bio: '热爱开源 🚀 写代码比写 Bug 多一点点 | 校园圈活跃用户',
      school: '北京某大学',
      dept: '计算机学院 · 大三',
      joinYear: '2022',
      verified: true,
      followingCount: 56,
      followerCount: 318,
      likeCount: '1.2k',
    },
    posts: [], // 当前展示
    postsCache: [], // 我的帖子缓存
    likesCache: [], // 点赞缓存
    likesLoaded: false,

    showPopup: false,
    popupType: '', // 'comment' | 'share' | ...
    currentPostId: '',
    currentCommentCount: 0,

    activePostId: '',
    activePostCommentCount: 0,

    lockScrollTop: 0,
    _isPreviewingImage: false,
  },

  onLoad() {
    this._currentScrollTop = 0;

    const systemInfo = wx.getWindowInfo()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    })
    this._loadPosts()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }
  },

  _loadPosts() {
    // 真实场景：请求 /user/posts?userId=self
    const _posts = [{
        id: 1,
        nickname: '不爱写Bug的学长',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
        content: '今天在二食堂发现了一家超级好吃的窗口！有人一起去打卡吗？🍱',
        images: ['/images/1760004156926.jpg'],
        commentCount: 8,
        likeCount: 21,
        isLiked: false,
        createdAt: '10分钟前',
      },
      {
        id: 2,
        nickname: '不爱写Bug的学长',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
        content: '图书馆五楼终于有位置了！期末周真的太难抢了 📚 大家加油备考！',
        images: [],
        commentCount: 21,
        likeCount: 34,
        isLiked: false,
        createdAt: '昨天',
      },
    ]

    this.setData({
      posts: _posts,
      postsCache: _posts
    })
  },

  _loadLikes() {
    const data = [{
      id: 1,
      nickname: '不爱写Bug的学长',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
      content: '今天在二食堂发现了一家超级好吃的窗口！有人一起去打卡吗？🍱',
      images: [],
      commentCount: 8,
      likeCount: 21,
      isLiked: true,
      createdAt: '10分钟前',
    },
  ]
    this.setData({
      posts: data,
      likesCache: data,
      likesLoaded: true
    })
  },

  // ===== 来自 user-profile 组件的事件 =====
  onGoSetting() {
    wx.navigateTo({
      url: '/subpkg_setting/pages/setting/setting'
    })
  },
  onEditProfile() {
    wx.navigateTo({
      url: '/subpkg_user/pages/edit-profile/edit-profile'
    })
  },
  onGoFollowing() {
    wx.navigateTo({
      url: '/pages/me/following/index'
    })
  },
  onGoFollower() {
    wx.navigateTo({
      url: '/pages/me/follower/index'
    })
  },
  onGoLiked() {
    wx.navigateTo({
      url: '/subpkg_community/pages/liked/index'
    })
  },
  onGoCollect() {
    wx.navigateTo({
      url: '/subpkg_community/pages/collect/index'
    })
  },
  onGoFiles() {
    wx.navigateTo({
      url: '/subpkg_community/pages/my-files/index'
    })
  },
  onGoHistory() {
    wx.navigateTo({
      url: '/subpkg_community/pages/history/index'
    })
  },

  onSwitchTab(e) {
    const tab = e.detail.tab
    this.setData({
      activeTab: tab
    })
    // 真实场景：按 tab 重新拉数据

    if (tab === 'likes' && !this.data.likesLoaded) {
      this._loadLikes() // ❗只在第一次点时请求
    }

    if (tab === 'posts') {
      // 如果之前加载过，直接用缓存
      this.setData({
        posts: this.data.postsCache
      })
    }

    if (tab === 'likes') {
      this.setData({
        posts: this.data.likesCache
      })
    }
  },

  // ===== 来自 post-card 组件的事件 =====
  onPostTap(e) {
    wx.navigateTo({
      url: `/subpkg_community/pages/detail/index?id=${e.detail.postId}`
    })
  },

  onPostUser(e) {
    wx.navigateTo({
      url: `/subpkg_user/pages/user/user?userId=${e.detail.userId}`
    })
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

  onPageScroll(e) {
    // 弹窗打开时不更新，避免 fixed 定位触发的滚动干扰
    if (!this.data.showPopup) {
      this._currentScrollTop = e.scrollTop;
    }

    // ✅ 实时记录滚动位置到页面 data，供 tabbar 读取
    this.data.__scrollTop__ = e.scrollTop // 用 this.data 直接赋值避免频繁 setData
  },

  notifyPreviewImage() {
    this._isPreviewingImage = true;
  },

  _lockScroll() {
    const scrollTop = this._currentScrollTop || 0;
    // 必须一次 setData 同时设置两者，保证原子渲染
    this.setData({
      lockScrollTop: scrollTop,
      showPopup: true,
    });
  },

  onOpenComment(e) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().toggleTabBarVisibility(false)
    }

    const {
      postId,
      commentCount
    } = e.detail

    wx.hideKeyboard()
    this._pullDownRefreshEnabled = true

    this.setData({
      currentPostId: postId,
      currentCommentCount: commentCount,
      popupType: 'comment',
    })

    this._lockScroll()
  },

  _restoreTabBar() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().toggleTabBarVisibility(true)
    }
  },

  onPopupBeforeLeave() {
    // page-container 暂不支持 beforeleave 阻断，这里做键盘收起兜底
    wx.hideKeyboard()
  },

  onPopupLeave() {
    this._restoreTabBar()
    // 只清状态，不做 pageScrollTo
    this.setData({
      showPopup: false,
      popupType: ''
    });
  },

  onPopupAfterLeave() {
    // ✅ 在这里恢复滚动，此时 page-container 动画已完全结束
    const scrollTop = this.data.lockScrollTop;
    wx.pageScrollTo({
      scrollTop,
      duration: 0
    });
  },

  onOverlayTap() {
    this._restoreTabBar()
    this.setData({
      showPopup: false
    })
  },

  onCommentClose() {
    this._restoreTabBar()
    this.setData({
      showPopup: false
    })
    // page-container 收到 show=false 后会触发 leave 事件
  },

  onCommentCountChange(e) {
    const {
      count
    } = e.detail
    const idx = this.data.posts.findIndex(p => p.postId === this.data.activePostId)
    if (idx !== -1) {
      this.setData({
        [`posts[${idx}].commentCount`]: count
      })
    }
    this.setData({
      activePostCommentCount: count
    })
  },
})