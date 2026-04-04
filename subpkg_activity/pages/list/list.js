// subpkg_activity/pages/list/index.js

// ─── 状态计算 ──────────────────────────────────────────────
// 放在文件顶部，所有 new Date() 都走这个函数
function parseDate(str) {
  if (!str) return null
  // 把 "2026-03-15 16:00" 转成 "2026-03-15T16:00"，iOS 兼容
  return new Date(str.replace(' ', 'T'))
}

function calcActivityStatus(activity) {
  if (activity.is_cancelled) return 'cancelled'

  const now      = new Date()
  const eStart   = parseDate(activity.enroll_start)
  const eEnd     = parseDate(activity.enroll_deadline)
  const actStart = parseDate(activity.start_time)
  const actEnd   = parseDate(activity.end_time)

  if (actEnd && now > actEnd) return 'ended'
  if (actStart && now >= actStart) return 'ongoing'
  if (eEnd && now > eEnd) return 'upcoming'
  if (eStart && now >= eStart && eEnd && now <= eEnd) return 'enrolling'
  if (eEnd && now < eEnd && (!eStart || now < eStart)) return 'enrolling'
  if (eStart && now < eStart) return 'preview'
  return 'unknown'
}

const STATUS_LABEL = {
  enrolling: '报名中',
  upcoming: '待开始',
  ongoing: '进行中',
  ended: '已结束',
  cancelled: '已取消',
  preview: '即将开始',
  unknown: '',
}

// 报名截止距今天数
function calcDaysToDeadline(deadline) {
  if (!deadline) return null
  return Math.ceil((parseDate(deadline) - new Date()) / 86400000)
}

// ─── Mock 数据，后端接入后换成 wx.request ──────────────────
const MOCK_ACTIVITIES = [{
    id: 'act_001',
    title: '2026年春日运动"云"打卡活动',
    cover: '/images/1760004156926.jpg',
    type: '打卡',
    scope: '全院',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '南昌大学科学技术学院学生委员会',
    summary: '面向全院学生开展的春日运动打卡活动',
    enroll_start: '',
    enroll_deadline: '2026-03-15 16:00',
    start_time: '2026-03-16',
    end_time: '2026-03-28',
    location: '',
    max_participants: null,
    series_id: '',
    series_name: '',
    source: '南大科院团联发〔2026〕2号',
    published_at: '2026-03-12',
    is_cancelled: false,
  },
  {
    id: 'act_002',
    title: '共青城市"青年说"宣讲大赛（第1期）',
    cover: '/images/1760004163342.jpg',
    type: '竞赛',
    scope: '信息学科部',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '',
    summary: '围绕"奋进十五五·讲述共青故事"主题开展宣讲',
    enroll_start: '2026-03-10',
    enroll_deadline: '2026-03-21 22:00',
    start_time: '2026-04-05',
    end_time: '2026-04-10',
    location: '',
    max_participants: null,
    series_id: '',
    series_name: '',
    source: '信团发〔2026〕10号',
    published_at: '2026-03-10',
    is_cancelled: false,
  },
  {
    id: 'act_003',
    title: '"清润明德，锋暖校园"志愿服务活动',
    cover: '/images/1760004156926.jpg',
    type: '志愿',
    scope: '全院',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '信息学科部总支委员会',
    summary: '对明德楼进行卫生清扫、杂物整理、环境清洁志愿服务',
    enroll_start: '2026-03-04 12:00',
    enroll_deadline: '2026-03-04 18:00',
    start_time: '2026-03-06 12:00',
    end_time: '2026-03-06 13:00',
    location: '明德楼（靠北门）',
    max_participants: 65,
    series_id: 'series_leifeng_2026',
    series_name: '雷锋月系列活动',
    source: '信团发〔2026〕7号',
    published_at: '2026-03-02',
    is_cancelled: false,
  },
  {
    id: 'act_004',
    title: '"拒绝舌尖浪费，争做光盘达人"主题活动',
    cover: '',
    type: '打卡',
    scope: '全院',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '青年志愿者协会',
    summary: '依托"光盘打卡"小程序开展节粮行动，连续打卡21天',
    enroll_start: '2026-03-04',
    enroll_deadline: '2026-03-04 22:00',
    start_time: '2026-03-04',
    end_time: '2026-03-24',
    location: '',
    max_participants: null,
    series_id: 'series_leifeng_2026',
    series_name: '雷锋月系列活动',
    source: '信团发〔2026〕7号',
    published_at: '2026-03-02',
    is_cancelled: false,
  },
]

// 按活动类型映射颜色和图标
const TYPE_MAP = {
  '志愿': {
    color: 'volunteer',
    icon: '🤝'
  },
  '竞赛': {
    color: 'competition',
    icon: '🏆'
  },
  '讲座': {
    color: 'lecture',
    icon: '🎤'
  },
  '论坛': {
    color: 'lecture',
    icon: '🎤'
  },
  '打卡': {
    color: 'checkin',
    icon: '✅'
  },
  '校园': {
    color: 'campus',
    icon: '🎉'
  },
  '招聘': {
    color: 'recruit',
    icon: '💼'
  },
  '实习': {
    color: 'recruit',
    icon: '💼'
  },
  '宣传': {
    color: 'campus',
    icon: '📢'
  },
  '评优': {
    color: 'competition',
    icon: '⭐'
  },
}

const STATUS_TABS = [{
    id: 'all',
    label: '全部'
  },
  {
    id: 'enrolling',
    label: '报名中'
  }, {
    id: 'upcoming',
    label: '待开始'
  }, {
    id: 'ongoing',
    label: '进行中'
  }, {
    id: 'ended',
    label: '已结束'
  }
]

// ──────────────────────────────────────────────────────────

Page({
  data: {
    statusBarHeight: 20,
    keyword: '',
    activeStatus: 'all',
    activeScope: '',
    statusTabs: STATUS_TABS,
    allList: [],
    filteredList: [],
    searchResult: [],
    seriesList: [],
    activeSeries: '',
  },

  onLoad() {
    const sys = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sys.statusBarHeight
    })
    this._loadActivities()
  },

  onShow() {
    if (this.data.allList.length) this._applyFilter()
  },

  _loadActivities() {
    // 真实场景：wx.request({ url: '/api/activity/list' })
    const list = MOCK_ACTIVITIES.map(a => {
      const status = calcActivityStatus(a)
      const typeInfo = TYPE_MAP[a.type] || {
        color: 'default',
        icon: '📌'
      }
      return {
        ...a,
        status,
        statusLabel: STATUS_LABEL[status],
        daysToDeadline: calcDaysToDeadline(a.enroll_deadline),
        typeColor: typeInfo.color,
        typeIcon: typeInfo.icon,
      }
    })

    // 提取系列
    const seriesMap = {}
    list.forEach(a => {
      if (a.series_id) {
        if (!seriesMap[a.series_id]) {
          seriesMap[a.series_id] = {
            series_id: a.series_id,
            series_name: a.series_name,
            count: 0
          }
        }
        seriesMap[a.series_id].count++
      }
    })

    this.setData({
      allList: list,
      seriesList: Object.values(seriesMap),
    })
    this._applyFilter()
  },

  _applyFilter() {
    const {
      allList,
      activeStatus,
      activeScope,
      activeSeries
    } = this.data
    let result = [...allList]

    if (activeStatus !== 'all') {
      result = result.filter(a => a.status === activeStatus)
    }
    if (activeScope) {
      result = result.filter(a => a.scope.includes(activeScope))
    }
    if (activeSeries) {
      result = result.filter(a => a.series_id === activeSeries)
    }

    // 排序：报名中 > 待开始 > 进行中 > 预告 > 已结束 > 已取消
    const order = {
      enrolling: 0,
      upcoming: 1,
      ongoing: 2,
      preview: 3,
      ended: 4,
      cancelled: 5,
      unknown: 6
    }
    result.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9))

    this.setData({
      filteredList: result
    })
  },

  onSwitchStatus(e) {
    this.setData({
      activeStatus: e.currentTarget.dataset.id,
      activeSeries: ''
    })
    this._applyFilter()
  },

  onFilterSeries(e) {
    const id = e.currentTarget.dataset.id
    const current = this.data.activeSeries
    this.setData({
      activeSeries: current === id ? '' : id,
      activeStatus: 'all',
    })
    this._applyFilter()
  },

  onShowScopeFilter() {
    // 收集所有 scope
    const scopes = [...new Set(this.data.allList.map(a => a.scope))]
    wx.showActionSheet({
      itemList: ['全部范围', ...scopes],
      success: (res) => {
        const selected = res.tapIndex === 0 ? '' : scopes[res.tapIndex - 1]
        this.setData({
          activeScope: selected
        })
        this._applyFilter()
      },
    })
  },

  onSearch(e) {
    const kw = e.detail.value.trim()
    this.setData({
      keyword: kw
    })
    if (!kw) return
    const result = this.data.allList.filter(a =>
      a.title.includes(kw) ||
      a.summary.includes(kw) ||
      a.organizer.includes(kw) ||
      a.type.includes(kw)
    )
    this.setData({
      searchResult: result
    })
  },

  onClearSearch() {
    this.setData({
      keyword: '',
      searchResult: []
    })
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/subpkg_activity/pages/detail/detail?id=${e.currentTarget.dataset.id}`,
    })
  },

  onBack() {
    wx.navigateBack()
  },
})