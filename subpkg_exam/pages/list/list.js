// subpkg_exam/pages/list/index.js

// ─── Mock，后端接入后换成 wx.request ───────────────────────
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

const CATEGORIES = [{
    id: 'all',
    icon: '📋',
    label: '全部'
  },
  {
    id: 'language',
    icon: '📖',
    label: '语言'
  },
  {
    id: 'computer',
    icon: '💻',
    label: '计算机'
  },
  {
    id: 'certificate',
    icon: '📜',
    label: '资格证'
  },
  {
    id: 'graduate',
    icon: '🎓',
    label: '升学'
  },
]
// ──────────────────────────────────────────────────────────
function calcDaysLeft(dateStr) {
  if (!dateStr) return 0
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  return diff > 0 ? diff : 0
}

function calcEnrollStatus(start, end) {
  if (!start || !end) return 'unknown'
  const now = new Date()
  if (now >= new Date(start) && now <= new Date(end)) return 'open'
  if (now < new Date(start)) return 'upcoming'
  return 'closed'
}

// 从 timeline 找最近的考试日期
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

// 从 timeline 找报名开始/截止
function findEnrollDates(timeline) {
  const start = timeline.find(t =>
    t.label.includes('报名') &&
    !t.label.includes('截止') &&
    !t.label.includes('确认') &&
    !t.label.includes('面试')
  )?.date || ''
  const end = timeline.find(t =>
    t.label.includes('截止')
  )?.date || ''
  return {
    start,
    end
  }
}

Page({
  data: {
    statusBarHeight: 20,
    keyword: '',
    activeCategory: 'all',
    categories: CATEGORIES,
    allExams: [],
    filteredExams: [],
    searchResult: [],
    hotExam: {},
  },

  onLoad() {
    const sys = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sys.statusBarHeight
    })
    this._loadExams()
  },

  onShow() {
    // 每次显示刷新倒计时（用户可能跨天返回）
    if (this.data.allExams.length) this._refreshCountdown()
  },

  _loadExams() {
    const app = getApp()
    app.getExamTimelines((timelines) => {
      const exams = MOCK_EXAMS.map(e => {
        const tl = timelines[e.id] || []

        // 优先用动态 timeline 算 examDate 和 enrollStatus
        // 没有 timeline 数据则用静态字段兜底
        const examDate = tl.length ? findExamDate(tl) : e.examDate
        const {
          start,
          end
        } = tl.length ?
          findEnrollDates(tl) :
          {
            start: e.enrollStart,
            end: e.enrollEnd
          }

        return {
          ...e,
          examDate,
          daysLeft: calcDaysLeft(examDate),
          enrollStatus: calcEnrollStatus(start, end),
        }
      })

      const withDate = exams.filter(e => e.examDate && e.daysLeft > 0)
      const hotExam = withDate.sort((a, b) => a.daysLeft - b.daysLeft)[0] || {}

      this.setData({
        allExams: exams,
        hotExam
      })
      this._filterExams()
    })
  },

  // 只刷新倒计时数字，不重新请求
  _refreshCountdown() {
    const exams = this.data.allExams.map(e => ({
      ...e,
      daysLeft: calcDaysLeft(e.examDate),
    }))
    const withDate = exams.filter(e => e.examDate && e.daysLeft > 0)
    const hotExam = withDate.sort((a, b) => a.daysLeft - b.daysLeft)[0] || {}
    this.setData({
      allExams: exams,
      hotExam
    })
    this._filterExams()
  },

  _filterExams() {
    const {
      allExams,
      activeCategory
    } = this.data
    const filtered = activeCategory === 'all' ?
      allExams :
      allExams.filter(e => e.category === activeCategory)
    this.setData({
      filteredExams: filtered
    })
  },

  onSwitchCategory(e) {
    this.setData({
      activeCategory: e.currentTarget.dataset.id
    })
    this._filterExams()
  },

  onSearch(e) {
    const kw = e.detail.value.trim()
    this.setData({
      keyword: kw
    })
    if (!kw) return
    const result = this.data.allExams.filter(ex =>
      ex.name.includes(kw) || ex.tagline.includes(kw)
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
  
  onBack() {
    wx.navigateBack()
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/subpkg_exam/pages/detail/detail?examId=${e.currentTarget.dataset.id}`,
    })
  },
})