// pages/message/index.js

// ─── 时间格式化 ────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const past = new Date(dateStr.replace(' ', 'T'))
  const diff = Math.floor((now - past) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
  const m = past.getMonth() + 1
  const d = past.getDate()
  return `${m}月${d}日`
}

// ─── 类型配置：标签文字、行动按钮文字、是否紧急 ─────────────
const TYPE_CONFIG = {
  system: {
    typeLabel: '系统公告',
    actionLabel: '',
    urgent: false
  },
  activity: {
    typeLabel: '活动截止',
    actionLabel: '去报名',
    urgent: true
  },
  exam: {
    typeLabel: '考试报名',
    actionLabel: '查看详情',
    urgent: true
  },
  interaction: {
    typeLabel: '互动',
    actionLabel: '',
    urgent: false
  },
}

// ─── 从通知内容提炼简短标题（去掉通知模板语气词）──────────────
// 规则：title 已改为直接说事的短句，此处直接透传
// 若后端返回的是旧格式（如"有人点赞了你的帖子"），可在此做二次映射
function deriveShortTitle(msg) {
  return msg.title
}

// ─── 从发件人/内容提取首字作为头像占位 ──────────────────────
function extractSenderInitial(content) {
  // content 格式: 「昵称」动作 → 取第一个「」内的第一个字
  const m = content.match(/「([^」]+)」/)
  if (m && m[1]) return m[1][0]
  return '匿'
}

// ─── Mock 数据 ──────────────────────────────────────────────
const MOCK_NOTIFICATIONS = [{
    id: 'msg_001',
    type: 'system',
    icon: '📢',
    title: '校园圈正式上线',
    content: '整合考试信息、校园活动、社区功能，欢迎体验并反馈建议。',
    isRead: false,
    createdAt: '2026-03-16 10:00',
    targetType: 'none',
    targetId: '',
  },
  {
    id: 'msg_002',
    type: 'activity',
    icon: '🏃',
    title: '春日运动云打卡活动报名今日截止',
    content: '报名将于 16:00 截止，名额有限，请尽快完成报名。',
    isRead: false,
    createdAt: '2026-03-15 09:30',
    targetType: 'activity',
    targetId: 'act_001',
  },
  {
    id: 'msg_003',
    type: 'exam',
    icon: '📖',
    title: '英语四级报名已开始，截止 3月31日',
    content: '请及时登录官网完成报名，错过需等半年。',
    isRead: true,
    createdAt: '2026-03-14 08:00',
    targetType: 'exam',
    targetId: 'cet4',
  },
  {
    id: 'msg_004',
    type: 'interaction',
    icon: '❤️',
    title: '帖子互动',
    content: '「不爱写Bug的学长」点赞了你的帖子「图书馆五楼今天好多人自习」',
    isRead: true,
    createdAt: '2026-03-13 20:15',
    targetType: 'post',
    targetId: 'post_001',
  },
  {
    id: 'msg_005',
    type: 'interaction',
    icon: '💬',
    title: '帖子互动',
    content: '「同学甲」评论：「学长这道题我也不会，求解析」',
    isRead: true,
    createdAt: '2026-03-09 16:40',
    targetType: 'post',
    targetId: 'post_001',
  },
]

// ─── 私信 Mock ─────────────────────────────────────────────
const MOCK_DM_LIST = []

// ─── 筛选 Tab ─────────────────────────────────────────────
const FILTER_TABS = [{
    id: 'all',
    icon: '🔔',
    label: '全部'
  },
  {
    id: 'system',
    icon: '📢',
    label: '系统'
  },
  {
    id: 'activity',
    icon: '🎉',
    label: '活动'
  },
  {
    id: 'exam',
    icon: '📖',
    label: '考试'
  },
  {
    id: 'interaction',
    icon: '❤️',
    label: '互动'
  },
]

const MESSAGE_TAB_INDEX = 3

// ─────────────────────────────────────────────────────────
Page({
  data: {
    statusBarHeight: 20,
    bannerTop: 80,
    activeTab: 'notification',
    activeFilter: 'all',
    filterTabs: FILTER_TABS,

    allMessages: [],
    groupedMessages: [], // 分组后的完整列表（用于渲染）
    urgentMessages: [], // 待处理区
    olderMessages: [], // 更早区
    unreadCount: 0,

    dmList: [],
    dmUnreadCount: 0,
  },

  onLoad() {
    const sys = wx.getWindowInfo()
    const menuBtn = wx.getMenuButtonBoundingClientRect()
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      bannerTop: menuBtn.bottom + 16,
    })
    this._loadMessages()
    this._loadDmList()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }
    this._loadMessages()
  },

  // ─── 通知 ──────────────────────────────────────────────
  _loadMessages() {
    const messages = MOCK_NOTIFICATIONS.map(m => {
      const cfg = TYPE_CONFIG[m.type] || {}
      return {
        ...m,
        timeAgo: timeAgo(m.createdAt),
        shortTitle: deriveShortTitle(m),
        shortContent: m.content,
        typeLabel: cfg.typeLabel || '',
        actionLabel: cfg.actionLabel || '',
        isUrgent: cfg.urgent && !m.isRead,
        senderInitial: m.type === 'interaction' ? extractSenderInitial(m.content) : '',
      }
    })

    const unreadCount = messages.filter(m => !m.isRead).length
    this.setData({
      allMessages: messages,
      unreadCount
    })
    this._applyFilter()
    this._syncTabBarBadge(unreadCount + this.data.dmUnreadCount)
  },

  _applyFilter() {
    const {
      allMessages,
      activeFilter
    } = this.data
    const filtered = activeFilter === 'all' ?
      allMessages :
      allMessages.filter(m => m.type === activeFilter)

    const grouped = this._groupMessages(filtered)

    // 分区：未读或紧急 → 待处理；其余 → 更早
    const urgent = grouped.filter(item =>
      item._isGroup ? false : (!item.isRead || item.isUrgent)
    )
    const older = grouped.filter(item =>
      item._isGroup ? true : (item.isRead && !item.isUrgent)
    )

    this.setData({
      groupedMessages: grouped,
      urgentMessages: urgent,
      olderMessages: older
    })
  },

  // 将同一 targetId 下的 interaction 通知合并为一个分组对象
  _groupMessages(messages) {
    const result = []
    // key: "interaction::targetId"
    const groupMap = {}

    for (const m of messages) {
      if (m.type === 'interaction') {
        const key = `interaction::${m.targetId}`
        if (!groupMap[key]) {
          const group = {
            id: key,
            type: 'interaction',
            icon: '💬',
            targetType: m.targetType,
            targetId: m.targetId,
            groupTitle: '帖子互动',
            timeRange: m.timeAgo, // 后面追加最早时间
            _isGroup: true,
            _grouped: [m],
          }
          groupMap[key] = group
          result.push(group)
        } else {
          groupMap[key]._grouped.push(m)
          // 用最早的那条时间作为时间范围右端
          groupMap[key].timeRange =
            `${groupMap[key]._grouped[0].timeAgo}～${m.timeAgo}`
        }
      } else {
        result.push(m)
      }
    }
    return result
  },

  onSwitchFilter(e) {
    this.setData({
      activeFilter: e.currentTarget.dataset.id
    })
    this._applyFilter()
  },

  onTapMessage(e) {
    const {
      id,
      targetType,
      targetId
    } = e.currentTarget.dataset
    this._markRead(id)
    this._navigate(targetType, targetId)
  },

  // 点击分组卡片头部 → 跳转到对应帖子
  onTapGroupedMessage(e) {
    const {
      targetType,
      targetId
    } = e.currentTarget.dataset
    this._navigate(targetType, targetId)
  },

  _markRead(id) {
    // 分组 key 不在 allMessages 里，直接忽略
    const messages = this.data.allMessages.map(m =>
      m.id === id ? {
        ...m,
        isRead: true
      } : m
    )
    const unreadCount = messages.filter(m => !m.isRead).length
    this.setData({
      allMessages: messages,
      unreadCount
    })
    this._applyFilter()
    this._syncTabBarBadge(unreadCount + this.data.dmUnreadCount)
  },

  onMarkAllRead() {
    const messages = this.data.allMessages.map(m => ({
      ...m,
      isRead: true
    }))
    this.setData({
      allMessages: messages,
      unreadCount: 0
    })
    this._applyFilter()
    this._syncTabBarBadge(this.data.dmUnreadCount)
    wx.showToast({
      title: '已全部标记已读',
      icon: 'none'
    })
  },

  // ─── 私信 ──────────────────────────────────────────────
  _loadDmList() {
    const dmList = MOCK_DM_LIST.map(d => ({
      ...d,
      timeAgo: timeAgo(d.lastTime)
    }))
    const dmUnreadCount = dmList.reduce((sum, d) => sum + (d.unread || 0), 0)
    this.setData({
      dmList,
      dmUnreadCount
    })
  },

  goChat(e) {
    wx.showToast({
      title: '私信功能即将上线',
      icon: 'none'
    })
  },

  onSearchDm() {
    wx.showToast({
      title: '私信功能即将上线',
      icon: 'none'
    })
  },

  // ─── 通用 ──────────────────────────────────────────────
  onSwitchTab(e) {
    this.setData({
      activeTab: e.currentTarget.dataset.tab
    })
  },

  _syncTabBarBadge(totalUnread) {
    if (totalUnread > 0) {
      wx.setTabBarBadge({
        index: MESSAGE_TAB_INDEX,
        text: totalUnread > 99 ? '99+' : String(totalUnread),
      })
    } else {
      wx.removeTabBarBadge({
        index: MESSAGE_TAB_INDEX
      })
    }
  },

  _navigate(targetType, targetId) {
    if (!targetType || targetType === 'none') return
    const routes = {
      activity: `/subpkg_activity/pages/detail/detail?id=${targetId}`,
      exam: `/subpkg_exam/pages/detail/detail?examId=${targetId}`,
      post: `/subpkg_community/pages/detail/index?id=${targetId}`,
    }
    const url = routes[targetType]
    if (url) wx.navigateTo({
      url
    })
  },
})