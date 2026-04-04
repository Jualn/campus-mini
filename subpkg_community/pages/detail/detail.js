// subpkg_community/pages/detail/index.js

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const past = new Date(dateStr.replace(' ', 'T'))
  const diff = Math.floor((now - past) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  const d = past
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// ─── Mock 数据 ──────────────────────────────────────────────
const MOCK_POST = {
  id: '1',
  userId: 'user_002',
  nickname: '不爱写Bug的学长',
  handle: 'bugfree_senior',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
  verified: true,
  isSelf: false,
  isFollowing: false,
  ipLocation: '江西',
  createdAt: '2026-03-15 20:30',
  content: '图书馆五楼今天好多人自习，氛围感超好！期末冲刺模式开启，大家一起加油💪\n\n顺便问一下有没有人有高数上册的复习资料，急急急！',
  images: ['/images/1760004156926.jpg', '/images/1760004163342.jpg', '/images/1760004163342.jpg'],
  topics: ['图书馆', '期末冲刺', '高数'],
  viewCount: 328,
  likeCount: 0,
  commentCount: 0,
  collectCount: 0,
  isLiked: false,
  isCollected: false,
}
// ──────────────────────────────────────────────────────────

// 输入栏自身高度（rpx 转 px）
const INPUT_BAR_HEIGHT_PX = 56

Page({
  data: {
    statusBarHeight: 20,

    // 页面底部留出输入栏 + 键盘的空间
    bottomPad: INPUT_BAR_HEIGHT_PX,
    keyboardHeight: 0,

    post: {},
    myAvatar: '',

    currentPostId: '',
    currentCommentCount: 0,

    // 输入相关
    inputFocused: false,
    inputValue: '',
    replyTarget: '',
    replyCommentId: '',
  },

  onLoad(options) {
    const sys = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sys.statusBarHeight
    })

    const app = getApp()
    this.setData({
      myAvatar: app.globalData?.userInfo?.avatar || ''
    })

    this._loadPost(options.id)

    // 监听键盘高度，输入栏跟随上移
    wx.onKeyboardHeightChange((res) => {
      const safeBottom = sys.screenHeight - (sys.safeArea?.bottom ?? sys.screenHeight)
      this.setData({
        keyboardHeight: res.height,
        // 页面底部 padding = 输入栏 + 键盘（键盘弹起时输入栏已在键盘上方）
        bottomPad: res.height > 0 ?
          res.height + INPUT_BAR_HEIGHT_PX : INPUT_BAR_HEIGHT_PX,
      })
    })
  },

  onUnload() {
    wx.offKeyboardHeightChange()
  },

  _loadPost(id) {
    // 真实场景：wx.request({ url: `/api/post/detail/${id}` })
    const post = {
      ...MOCK_POST,
      createdAtText: timeAgo(MOCK_POST.createdAt),
    }
    this.setData({
      post,
      currentPostId: post.id,
      currentCommentCount: post.commentCount
    })
  },

  // comment-panel 回调：评论数变化时同步到帖子数据
  onCommentCountChange(e) {
    this.setData({
      'post.commentCount': e.detail.count
    })
  },

  // ─── 帖子操作 ────────────────────────────────────────────

  onLike() {
    const {
      isLiked,
      likeCount
    } = this.data.post
    this.setData({
      'post.isLiked': !isLiked,
      'post.likeCount': isLiked ? likeCount - 1 : likeCount + 1,
    })
    // wx.request({ url: `/api/post/${id}/like`, method: 'POST' })
  },

  onComment(e) {
    const comp = this.selectComponent('#post-detail-comment-panel')
    comp.setData({inputAutoFocus: true})
  },
  
  onCollect() {
    const {
      isCollected,
      collectCount
    } = this.data.post
    this.setData({
      'post.isCollected': !isCollected,
      'post.collectCount': isCollected ? collectCount - 1 : collectCount + 1,
    })
    wx.showToast({
      title: isCollected ? '已取消收藏' : '已收藏',
      icon: 'none'
    })
  },

  onToggleFollow() {
    const isFollowing = this.data.post.isFollowing
    this.setData({
      'post.isFollowing': !isFollowing
    })
    wx.showToast({
      title: isFollowing ? '已取消关注' : '已关注',
      icon: 'none'
    })
  },

  onTapTopic(e) {
    wx.navigateTo({
      url: `/subpkg_community/pages/topic/index?topic=${e.currentTarget.dataset.topic}`,
    })
  },

  goToUser(e) {
    wx.navigateTo({
      url: `/subpkg_user/pages/user/index?userId=${e.currentTarget.dataset.id}`,
    })
  },

  // ─── 分享 & 更多 ─────────────────────────────────────────

  onShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  onShareAppMessage() {
    return {
      title: this.data.post.content?.slice(0, 30) || '校园圈动态',
      imageUrl: this.data.post.images?.[0] || '',
    }
  },

  onMore() {
    const {
      isSelf
    } = this.data.post
    wx.showActionSheet({
      itemList: isSelf ? ['删除帖子'] : ['举报', '不感兴趣', '复制链接'],
      success: (res) => {
        if (isSelf && res.tapIndex === 0) {
          wx.showModal({
            title: '删除帖子',
            content: '确认删除这条动态？',
            confirmText: '删除',
            confirmColor: '#FF3B30',
            success: (r) => {
              if (r.confirm) wx.navigateBack()
            },
          })
        } else if (!isSelf && res.tapIndex === 2) {
          wx.setClipboardData({
            data: `https://your-domain.com/post/${this.data.post.id}`,
            success: () => wx.showToast({
              title: '链接已复制',
              icon: 'none'
            }),
          })
        }
      },
    })
  },

  onBack() {
    wx.navigateBack()
  },
})