// components/post-card/index.js
/**
 * post-card 组件
 *
 * Properties:
 *   post  Object  帖子数据
 *     - id, nickname, avatar, content, images
 *     - commentCount, likeCount, isLiked, createdAt
 *
 * Events:
 *   tap     → 点击卡片跳详情，{ postId }
 *   like    → 点赞/取消，{ postId, isLiked }
 *   comment → 打开评论，{ postId, commentCount }
 *   more    → 点击 ···，{ postId }
 */

const {
  getAvatarInfo
} = require('../../utils/avatar')
const {
  drawPostPoster
} = require('../../utils/share_poster/postPoster')

Component({
  properties: {
    post: {
      type: Object,
      value: {},
      observer(newVal) {
        if (!newVal) return
        const {
          char,
          bg
        } = getAvatarInfo(newVal.nickname)
        this.setData({
          _avatarUrl: newVal.avatar || '',
          _avatarChar: char,
          _avatarBg: bg,
        })

        // 确保 images 始终是数组
        if (newVal && !Array.isArray(newVal.images)) {
          this.setData({
            'post.images': []
          })
        }
      }
    },
  },
  data: {
    _avatarUrl: '',
    _avatarChar: '',
    _avatarBg: '',
  },
  methods: {
    noop() {},
    onTapCard() {
      this.triggerEvent('posttap', {
        postId: this.properties.post.id
      })
    },

    onTapAvatar() {
      this.triggerEvent('user', {
        userId: this.properties.post.userId
      })
    },

    onLike() {
      const {
        id,
        isLiked
      } = this.properties.post
      this.triggerEvent('like', {
        postId: id,
        isLiked
      })
    },

    onComment() {
      const {
        id,
        commentCount
      } = this.properties.post
      this.triggerEvent('comment', {
        postId: id,
        commentCount
      })
    },

    async onShare() {
      const post = this.properties.post
      this.triggerEvent('share', {
        shareTitle: '你好',
        sharePath: `/subpkg_community/pages/detail/detail?postId=${post.id}`,
        shareImage: ''
      })

      const postData = {
        avatarUrl: post.avatar || '',
        avatarChar: this.data._avatarChar,
        avatarBg: this.data._avatarBg,
        name: post.nickname || '',
        content: post.content || '',
        images: post.images || '',
        time: post.createdAt
      }

      drawPostPoster(this, postData, (tempFilePath) => {
        this.triggerEvent('shareImageReady', {
          shareImage: tempFilePath
        })
      })

    },

    onMoreTap() {
      const {
        id
      } = this.properties.post
      wx.showActionSheet({
        itemList: ['举报', '不感兴趣', '复制链接'],
        success(res) {
          if (res.tapIndex === 0) wx.showToast({
            title: '举报已提交',
            icon: 'success'
          })
          if (res.tapIndex === 1) wx.showToast({
            title: '已标记不感兴趣',
            icon: 'none'
          })
          if (res.tapIndex === 2) wx.setClipboardData({
            data: `https://example.com/post/${id}`
          })
        },
      })
    },
  },
})