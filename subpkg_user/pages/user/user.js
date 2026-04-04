// pages/user/index.js
Page({
  data: {
    statusBarHeight: 20,
    activeTab: 'posts',
    isFollowing: false,
    userInfo: {},
    posts: [],

    showPopup: false,
    popupType: '', // 'comment' | 'share' | ...
    currentPostId: '',
    currentCommentCount: 0,

    activePostId: '',
    activePostCommentCount: 0,

    lockScrollTop: 0,
    _isPreviewingImage: false,
  },

  onLoad(options) {
    this._currentScrollTop = 0;

    const systemInfo = wx.getWindowInfo()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    })
    this._loadUserProfile(1);
    if (options.userId) {
      this._loadUserProfile(options.userId)
    }
  },

  _loadUserProfile(userId) {
    // 真实场景：请求 /user/profile?userId=xxx
    this.setData({
      userInfo: {
        nickname: '张晓梅',
        handle: 'xiaomei_zhang',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=2',
        bannerUrl: '',
        bio: '外国语学院 大二 | 备考四六级中 📖',
        school: '北京某大学',
        dept: '外国语学院 · 大二',
        joinYear: '2023',
        verified: false,
        followingCount: 32,
        followerCount: 120,
        likeCount: 456,
      },
      posts: [{
        id: 1,
        nickname: '张晓梅',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=2',
        content: '今天食堂三楼出了新菜 🍜 麻辣香锅，有没有一起备考四六级的同学？',
        images: [],
        commentCount: 23,
        likeCount: 64,
        isLiked: false,
        createdAt: '3小时前',
      }, ],
    })
  },

  onBack() {
    wx.navigateBack()
  },
  onToggleFollow() {
    this.setData({
      isFollowing: !this.data.isFollowing
    })
  },
  onGoFollowing() {
    wx.navigateTo({
      url: `/pages/user/following/index?userId=${this._userId}`
    })
  },
  onGoFollower() {
    wx.navigateTo({
      url: `/pages/user/follower/index?userId=${this._userId}`
    })
  },

  onMore(e) {
    const action = e.detail.action
    if (action === 0) wx.navigateTo({
      url: '/pages/message/index'
    })
    if (action === 1) wx.showToast({
      title: '举报已提交',
      icon: 'success'
    })
    if (action === 2) wx.showToast({
      title: '已拉黑',
      icon: 'none'
    })
  },

  onSwitchTab(e) {
    this.setData({
      activeTab: e.detail.tab
    })
  },

  onPostTap(e) {
    wx.navigateTo({
      url: `/subpkg_community/pages/detail/index?id=${e.detail.postId}`
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