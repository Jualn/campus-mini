/**
 * comment-panel 组件 JS
 *
 * Properties:
 *   mode        String  'sheet' | 'inline'  显示模式
 *   targetId    String  帖子/活动 id
 *   targetType  String  'post' | 'activity' 类型（预留给真实接口区分）
 *   totalCount  Number  评论总数（可由父组件传入初始值）
 *   inlineTitle String  inline 模式下的标题，默认"评论"
 *   visible     Boolean sheet 模式下是否显示（父组件控制）
 *
 * Events（triggerEvent）:
 *   close     → sheet 关闭
 *   countChange → { count } 评论数变化，父组件同步展示
 */

const api = require('../../mock/commentApi')
const {
  getAvatarInfo
} = require('../../utils/avatar')

// 当前登录用户（真实场景从 app.globalData 或 store 取）
const SELF_USER = {
  userId: 'self',
  nickName: '我',
  avatarBg: '#43e97b',
  avatarChar: '我',
  avatarUrl: '/images/1760004156926.jpg', // ✅ 有头像时填 url，没有留空
}

const PAGE_SIZE = 5

Component({
  properties: {
    mode: {
      type: String,
      value: 'sheet'
    },
    targetId: {
      type: String,
      value: ''
    },
    targetType: {
      type: String,
      value: 'post'
    },
    totalCount: {
      type: Number,
      value: 0
    },
    inlineTitle: {
      type: String,
      value: '评论'
    },
    visible: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (this.properties.mode !== 'sheet') return
        if (newVal) {
          this._onSheetOpen()
        }
      }
    },
  },

  data: {
    loading: false, // 防止多次请求
    hasInit: false, // observers防止重复初始化
    firstLoading: true, // 控制ui显示的
    loadingMore: false,

    commentList: [], // 已渲染的评论列表
    page: 0,
    hasMoreComments: true,

    // 输入状态
    canSend: false,
    inputValue: '',
    inputFocused: false,
    inputAutoFocus: false, // ✅ 新增：控制 textarea 自动聚焦
    previewImage: '', // inline 模式配图（一级评论）
    replyTarget: {}, // { commentId, userId, nickName } 正在回复谁

    keyboardOpen: false,
    keyboardBottom: 0, // 先占位，attached 里会赋真实安全区值

    _handleStartY: 0,
    _handleStartX: 0,
    _isDraggingHandle: false,
    _scrollTop: 0, // scroll-view 当前滚动位置

    sheetTranslateY: 0, // 面板当前位移（px）
    sheetTransition: 'none', // 控制是否有过渡动画
    maskOpacity: 0,
    maskTransition: 'none',

    selfAvatarBg: SELF_USER.avatarBg,
    selfAvatarChar: SELF_USER.avatarChar,
    selfAvatarUrl: SELF_USER.avatarUrl,
  },

  observers: {
    'targetId': function (id) {
      if (!id || this.data.hasInit) return

      this.setData({
        hasInit: true
      })
      if (id && this.properties.mode === 'inline') {
        this._loadComments(true)
      }
    }
  },

  lifetimes: {
    attached() {
      // ✅ 获取安全区高度，作为键盘收起时的默认 bottom
      const info = wx.getWindowInfo()
      // safeArea.bottom 是距屏幕底部的安全距离（px）
      const safeBottom = info.screenHeight - info.safeArea.bottom
      this._safeBottom = safeBottom
      this._windowHeight = info.windowHeight // px，供后续计算用
      this._panelHeight = info.windowHeight * 0.8

      // 初始状态：面板在屏幕下方，遮罩透明
      this.setData({
        keyboardBottom: safeBottom,
        sheetTranslateY: this._panelHeight,
        sheetTransition: 'none',
        maskOpacity: 0,
        maskTransition: 'none',
      })

      // 下一帧触发入场动画（确保初始 setData 已渲染）
      setTimeout(() => {
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.38s ease',
        })
      }, 30)

      // ✅ adjust-position=false 后，系统不再顶起 webview
      // onKeyboardHeightChange 的 height 就是纯键盘高度，直接用
      wx.onKeyboardHeightChange((res) => {
        const kbHeight = res.height || 0
        this.setData({
          keyboardBottom: kbHeight > 0 ? kbHeight : safeBottom,
          keyboardOpen: kbHeight > 0,
        })
      })
    },

    ready() {

    },

    detached() {
      wx.offKeyboardHeightChange()
    },
  },

  methods: {
    // 空函数，用于 wxml 中阻止滚动穿透
    noop() {},

    // ===================== SHEET 控制 =====================
    _onSheetOpen() {
      // 等两帧：第一帧 page-container 开始动画，第二帧 DOM 尺寸稳定
      wx.nextTick(() => {
        this.setData({
          inputAutoFocus: true
        })
      })

      if (this.data.commentList.length === 0) {
        this._loadComments(true)
      }
    },

    onClose() {
      const panelHeight = this._panelHeight || 600
      this.setData({
        sheetTranslateY: panelHeight,
        sheetTransition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        maskOpacity: 0,
        maskTransition: 'opacity 0.28s ease',
        inputAutoFocus: false
      })
      // 动画结束后触发 close，父页面把 show 设 false，wx:if 卸载组件
      setTimeout(() => {
        this.triggerEvent('close')
      }, 340)
    },

    // ===================== Handle 条手势关闭 =====================
    onHandleTouchStart(e) {
      this._dragStartY = e.touches[0].clientY
      // 拖动开始，关闭过渡动画（让面板跟手）
      this.setData({
        sheetTransition: 'none',
        maskTransition: 'none'
      })
    },

    onHandleTouchMove(e) {
      const deltaY = e.touches[0].clientY - this._dragStartY
      // 只允许向下拖（向上不让压缩面板）
      if (deltaY <= 0) return
      // ✅ 超过阈值后阻力减小（乘以系数），感觉更轻盈
      // const resistance = deltaY > 120 ? 1.0 : 0.6
      // this.setData({sheetTranslateY: deltaY * resistance})

      const panelHeight = this._panelHeight || 600
      // 视觉上稍微有点阻力感，但不要压太多
      const visual = deltaY * 0.88
      const maskOpacity = Math.max(0, 1 - visual / panelHeight)
      this.setData({
        sheetTranslateY: visual,
        maskOpacity
      })
    },

    onHandleTouchEnd(e) {
      const deltaY = e.changedTouches[0].clientY - this._dragStartY
      if (deltaY > 80) {
        this.onClose()
      } else {
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.35s ease',
        })
      }
    },

    onScrollToUpper() {
      this._scrollTop = 0;
    },

    // 记录 scroll-view 滚动位置
    onScroll(e) {
      this._scrollTop = e.detail.scrollTop
    },

    // 滚动到底部自动加载（sheet 模式）
    onScrollToLower() {
      this.loadMoreComments()
    },

    // ─────────────────────────────────────────
    // scroll-view 区域：根据 scrollTop 决定行为
    // ─────────────────────────────────────────
    onListTouchStart(e) {
      this._listStartY = e.touches[0].clientY;
      this._listStartX = e.touches[0].clientX;
      this._listDraggingSheet = false;
      this._listMoved = false;
      this.setData({
        sheetTransition: 'none',
        maskTransition: 'none',
      });
    },

    onListTouchMove(e) {
      const clientY = e.touches[0].clientY;
      const deltaY = clientY - this._listStartY;
      const deltaX = Math.abs(e.touches[0].clientX - this._listStartX);

      this._listMoved = true;

      // 横滑且还没进入拖面板模式，放行给 scroll-view
      if (deltaX > Math.abs(deltaY) && !this._listDraggingSheet) return;

      // ✅ 修复1：扩大容差到 15（甚至 20）。
      // 因为滚动有惯性，用户可能在 scrollTop 为 10 的时候就进行了下拉关闭的手势
      const scrollTop = this._scrollTop || 0;
      const panelHeight = this._panelHeight || 600;

      if (this._listDraggingSheet) {
        if (deltaY > 0) {
          const visual = deltaY * 0.88;
          this.setData({
            sheetTranslateY: visual,
            maskOpacity: Math.max(0, 1 - visual / panelHeight),
          });
        } else {
          // ✅ 修复2：手指往回拉（deltaY 变负），允许面板跟着归零
          this.setData({
            sheetTranslateY: 0,
            maskOpacity: 1,
          });
        }
      } else if (deltaY > 0 && scrollTop <= 15) {
        // ✅ 修复3：当前为下拉动作，且处于顶部容差范围内，触发面板拖拽
        // 重置 listStartY 为当前位置，让面板无缝丝滑跟手，不会发生跳动
        this._listStartY = clientY;
        this._listDraggingSheet = true;
      }
    },

    onListTouchEnd(e) {
      if (!this._listMoved) return;

      if (this._listDraggingSheet) {
        // 这里的 deltaY 是相对于触发拖拽那一刻的位移，所以用 80 阈值很准确
        const deltaY = e.changedTouches[0].clientY - this._listStartY;
        if (deltaY > 80) {
          this.onClose();
        } else {
          this.setData({
            sheetTranslateY: 0,
            sheetTransition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
            maskOpacity: 1,
            maskTransition: 'opacity 0.35s ease',
          });
        }
      } else {
        // 没有触发拖拽面板（比如只是在滚动列表），确保面板处于复位状态
        this.setData({
          sheetTranslateY: 0,
          sheetTransition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
          maskOpacity: 1,
          maskTransition: 'opacity 0.35s ease',
        });
      }
    },

    // ===================== 加载评论 =====================
    async _loadComments(isFirst = false) {
      // ❗同步锁（关键）
      if (this._loading) return
      this._loading = true

      const {
        targetId,
        totalCount
      } = this.properties
      if (!targetId) {
        this._loading = false
        return
      }

      if (isFirst) {
        this.setData({
          firstLoading: true,
          page: 0,
          commentList: [],
          hasMoreComments: true,
        })
      } else {
        this.setData({
          loadingMore: true
        })
      }

      try {
        const page = isFirst ? 0 : this.data.page
        const res = await api.fetchComments(targetId, page, totalCount || 30)

        if (res.code !== 0) return

        const newItems = res.data.list.map(c => this._initCommentState(c))

        const commentList = isFirst ?
          newItems : [...this.data.commentList, ...newItems]


        this.setData({
          commentList,
          page: page + 1,
          hasMoreComments: res.data.hasMore,
        })
        console.log(this.data.commentList)
      } finally {
        this._loading = false

        this.setData({
          firstLoading: false,
          loadingMore: false,
        })
      }
    },

    // 初始化一条评论的前端状态
    _initCommentState(comment) {
      const {
        char,
        bg
      } = getAvatarInfo(comment.nickName)
      return {
        ...comment,
        _avatarChar: char,
        _avatarBg: bg,
        repliesExpanded: false, // 二级是否已展开
        replyList: [], // 展开后加载的所有回复
        hasMoreReplies: false,
        loadingReplies: false,
        remainReplies: 0,
        replyOffset: 0, // 已加载回复偏移（跳过 preview）
      }
    },

    loadMoreComments() {
      if (this.data.loadingMore || !this.data.hasMoreComments) return
      this._loadComments(false)
    },

    // ===================== 二级回复 =====================
    async onExpandReplies(e) {
      const {
        commentId
      } = e.currentTarget.dataset
      const idx = this._findCommentIdx(commentId)
      if (idx === -1) return

      // 标记展开中
      this._updateComment(idx, {
        loadingReplies: true,
        repliesExpanded: true
      })
      // 初始展示 preview 作为前几条
      const comment = this.data.commentList[idx]
      const initialReplies = [...(comment.replyPreview || [])]
      this._updateComment(idx, {
        replyList: initialReplies,
        loadingReplies: false,
      })

      // 如果 preview 条数 < total，继续加载剩余
      if (comment.replyCount > (comment.replyPreview || []).length) {
        await this._loadReplies(idx, commentId, 0)
      }
    },

    async onLoadMoreReplies(e) {
      const {
        commentId
      } = e.currentTarget.dataset
      const idx = this._findCommentIdx(commentId)
      if (idx === -1) return
      const comment = this.data.commentList[idx]
      if (comment.loadingReplies) return
      await this._loadReplies(idx, commentId, comment.replyOffset)
    },

    async _loadReplies(idx, commentId, offset) {
      this._updateComment(idx, {
        loadingReplies: true
      })
      const res = await api.fetchReplies(this.properties.targetId, commentId, offset)

      if (res.code !== 0) {
        this._updateComment(idx, {
          loadingReplies: false
        })
        return
      }

      const comment = this.data.commentList[idx]
      // 合并：preview + 已加载 + 新加载
      // 去重（preview 可能和 fetchReplies 重叠）
      const existIds = new Set(comment.replyList.map(r => r.replyId))
      const newReplies = res.data.list.filter(r => !existIds.has(r.replyId))
      const replyList = [...comment.replyList, ...newReplies]
      const newOffset = offset + res.data.list.length
      const remainReplies = res.data.total - replyList.length - api.REPLY_PREVIEW_COUNT

      this._updateComment(idx, {
        replyList,
        hasMoreReplies: res.data.hasMore,
        remainReplies: Math.max(0, remainReplies),
        replyOffset: newOffset,
        loadingReplies: false,
      })
    },

    // ===================== 回复目标 =====================
    onReplyTap(e) {
      const {
        commentId,
        nickName,
        userId
      } = e.currentTarget.dataset
      this.setData({
        inputAutoFocus: true,
        replyTarget: {
          commentId,
          nickName,
          userId
        }
      })
    },

    cancelReply() {
      this.setData({
        inputAutoFocus: false,
        replyTarget: {}
      })
    },

    // ===================== 发送 =====================
    onInputChange(e) {
      const value = e.detail.value || ''
      this.setData({
        inputValue: value,
        canSend: value.trim().length > 0
      })
    },

    onInputFocus(e) {
      this.setData({
        inputFocused: true,
      })

      // 兜底：部分机型 onKeyboardHeightChange 比 focus 慢
      const h = e.detail.height || 0
      if (h > 0) {
        this.setData({
          keyboardBottom: h,
          keyboardOpen: true
        })
      }
    },

    onInputBlur() {
      this.setData({
        inputAutoFocus: false,
        inputFocused: false,
        keyboardBottom: this._safeBottom || 0,
        keyboardOpen: false,
      })
    },

    async onSend() {
      if (!this.data.canSend) return

      // ✅ 第一步：先把所有需要的值取出来
      const {
        inputValue,
        replyTarget,
        previewImage
      } = this.data
      const text = inputValue.trim()

      // ✅ 第二步：校验
      if (!text && !previewImage) {
        wx.showToast({
          title: '请输入内容',
          icon: 'none'
        })
        return
      }

      // ✅ 第三步：通知父组件 + 清空输入框
      this.triggerEvent('send', {
        content: text
      })
      this.setData({
        inputValue: '',
        canSend: false,
        previewImage: ''
      })
      this.cancelReply()

      const params = {
        targetId: this.properties.targetId,
        content: text,
        imageUrl: replyTarget.commentId ? '' : previewImage,
        replyToCommentId: replyTarget.commentId || '',
        replyToUserId: replyTarget.userId || '',
        replyToName: replyTarget.nickName || '',
      }

      this.setData({
        inputValue: '',
        previewImage: ''
      })
      this.cancelReply()

      const res = await api.postComment(params)
      if (res.code !== 0) {
        wx.showToast({
          title: '发送失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: '发布成功',
        icon: 'success',
        duration: 1500
      })

      const data = res.data
      if (data.type === 'comment') {
        // 新一级评论插入顶部
        const newComment = this._initCommentState(data.comment)
        this.setData({
          commentList: [newComment, ...this.data.commentList],
        })
        this._syncCount(1)
      } else if (data.type === 'reply') {
        // 新回复插入到对应评论的 replyList 末尾
        const idx = this._findCommentIdx(data.commentId)
        if (idx !== -1) {
          const comment = this.data.commentList[idx]
          const replyList = [...(comment.replyList || []), data.reply]
          this._updateComment(idx, {
            replyList,
            repliesExpanded: true,
            replyCount: comment.replyCount + 1,
          })
        }
        this._syncCount(1)
      }
    },

    // ===================== 图片选择（inline 模式一级评论）=====================
    onChooseImage() {
      if (this.data.replyTarget.commentId) return // 回复不能配图
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const url = res.tempFiles[0].tempFilePath
          this.setData({
            previewImage: url
          })
          // 真实场景：上传 OSS 后替换 url
        },
      })
    },

    removeImage() {
      this.setData({
        previewImage: ''
      })
    },

    // ===================== 点赞 =====================
    async onCommentLike(e) {
      const {
        commentId,
        isLiked
      } = e.currentTarget.dataset
      const idx = this._findCommentIdx(commentId)
      if (idx === -1) return

      // 乐观更新
      const comment = this.data.commentList[idx]
      this._updateComment(idx, {
        isLiked: !isLiked,
        likeCount: comment.likeCount + (isLiked ? -1 : 1),
      })

      const res = await api.toggleLike(this.properties.targetId, 'comment', commentId, isLiked)
      if (res.code !== 0) {
        // 回滚
        this._updateComment(idx, {
          isLiked,
          likeCount: comment.likeCount
        })
      }
    },

    async onReplyLike(e) {
      const {
        commentId,
        replyId,
        isLiked
      } = e.currentTarget.dataset
      const cidx = this._findCommentIdx(commentId)
      if (cidx === -1) return

      const comment = this.data.commentList[cidx]
      const ridx = (comment.replyList || []).findIndex(r => r.replyId === replyId)
      if (ridx === -1) return

      // 乐观更新
      const reply = comment.replyList[ridx]
      const newReplyList = [...comment.replyList]
      newReplyList[ridx] = {
        ...reply,
        isLiked: !isLiked,
        likeCount: reply.likeCount + (isLiked ? -1 : 1)
      }
      this._updateComment(cidx, {
        replyList: newReplyList
      })

      const res = await api.toggleLike(this.properties.targetId, 'reply', replyId, isLiked)
      if (res.code !== 0) {
        newReplyList[ridx] = reply
        this._updateComment(cidx, {
          replyList: newReplyList
        })
      }
    },

    // ===================== 图片预览 =====================
    onPreviewImage(e) {
      const {
        url
      } = e.currentTarget.dataset
      wx.previewImage({
        urls: [url],
        current: url
      })
    },

    // ===================== 工具方法 =====================
    _findCommentIdx(commentId) {
      return this.data.commentList.findIndex(c => c.commentId === commentId)
    },

    // 更新单条评论的部分字段（避免全量 setData）
    _updateComment(idx, fields) {
      const prefix = `commentList[${idx}]`
      const updates = {}
      Object.keys(fields).forEach(k => {
        updates[`${prefix}.${k}`] = fields[k]
      })
      this.setData(updates)
    },

    _syncCount(delta) {
      this.triggerEvent('countChange', {
        count: (this.properties.totalCount || 0) + delta
      })
    },

    goToUser(e) {
      const userId = e.currentTarget.dataset.userId
      wx.navigateTo({
        url: `/subpkg_user/pages/user/user?userId=${userId}`
      })
    },

    // 供父组件调用：外部强制刷新
    refresh() {
      this._loadComments(true)
    },
  },
})