// app.js
App({
  BASE_URL: 'https://your-api.com', // 替换为实际域名

  _timelineCallbacks: [],

  globalData: {
    selectedTabIndex: '', // 全局保存当前选中tabbar索引
    scrollTops: {}, // ✅ 存储各页面的滚动位置

    // 所有考试的 timeline，key 为 examId
    // { cet4: [...], cet6: [...], kaoyan: [...] }
    examTimelines: {
      cet4: [{
          label: '网上报名',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '报名截止',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '准考证打印',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: '可在报名网站下载打印'
        },
        {
          label: '口语考试',
          date: '2026-05-23',
          time: '',
          source: '学校教务处公告',
          note: '口语为单独报名，往年通常在笔试前数周内，以准考证上为主'
        },
        {
          label: '笔试',
          date: '2026-06-13',
          time: '09:00',
          source: '教育部公告',
          note: ''
        },
        {
          label: '成绩查询',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在笔试后3-4月，以教育部公告为准'
        },
      ],
      cet6: [{
          label: '网上报名',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '报名截止',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '准考证打印',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '笔试',
          date: '2026-06-13',
          time: '15:00',
          source: '教育部公告',
          note: ''
        },
        {
          label: '成绩查询',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在笔试后3-4月，以教育部公告为准'
        },
      ],
      putonghua: [{
          label: '报名',
          date: '',
          time: '',
          source: '当地测试机构',
          note: '各地滚动安排，请关注当地通知'
        },
        {
          label: '测试',
          date: '',
          time: '',
          source: '当地测试机构',
          note: ''
        },
        {
          label: '成绩查询',
          date: '',
          time: '',
          source: '当地测试机构',
          note: '以当地测试机构通知为准'
        },
      ],
      ncre: [{
          label: '网上报名',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '报名截止',
          date: '',
          time: '',
          source: '学校教务处公告',
          note: ''
        },
        {
          label: '上机考试',
          date: '2025-03-28',
          time: '',
          source: '教育部公告',
          note: '具体考试时间段以准考证为准'
        },
        {
          label: '成绩查询',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在考后约一个月，以官方公告为准'
        },
      ],
      teacher: [{
          label: '笔试报名',
          date: '2026-01-09',
          time: '10:00',
          source: '教育部公告',
          note: ''
        },
        {
          label: '报名截止',
          date: '2026-01-12',
          time: '16:00',
          source: '教育部公告',
          note: ''
        },
        {
          label: '网上缴费截止日期',
          date: '2026-01-13',
          time: '23:59',
          source: '教育部公告',
          note: ''
        },
        {
          label: '笔试',
          date: '2026-03-07',
          time: '',
          source: '教育部公告',
          note: '具体时间段以准考证为准'
        },
        {
          label: '笔试成绩',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在笔试后约一个月'
        },
        {
          label: '面试报名',
          date: '',
          time: '',
          source: '各省教育局',
          note: '笔试通过后方可报名，时间以各省通知为准'
        },
        {
          label: '面试',
          date: '',
          time: '',
          source: '各省教育局',
          note: '由各省教育局自行安排，请关注本省通知'
        },
      ],
      kaoyan: [{
          label: '预报名',
          date: '2026-09-24',
          time: '',
          source: '教育部公告',
          note: '仅限应届本科生，非必须'
        },
        {
          label: '正式报名',
          date: '2026-10-01',
          time: '',
          source: '教育部公告',
          note: ''
        },
        {
          label: '报名截止',
          date: '2026-10-31',
          time: '',
          source: '教育部公告',
          note: ''
        },
        {
          label: '报名确认',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在11月上旬，部分省份网上确认，以公告为准'
        },
        {
          label: '准考证下载',
          date: '2026-12-14',
          time: '',
          source: '教育部公告',
          note: '在研招网下载打印'
        },
        {
          label: '初试第一天',
          date: '2026-12-20',
          time: '08:30',
          source: '教育部公告',
          note: '政治、外语'
        },
        {
          label: '初试第二天',
          date: '2026-12-21',
          time: '08:30',
          source: '教育部公告',
          note: '专业课一、专业课二'
        },
        {
          label: '初试成绩',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在次年2月，以教育部公告为准'
        },
        {
          label: '国家线公布',
          date: '',
          time: '',
          source: '教育部公告',
          note: '往年通常在次年3月'
        },
        {
          label: '复试',
          date: '',
          time: '',
          source: '各招生院校',
          note: '达国家线后关注目标院校通知，时间因校而异'
        },
      ],
    },
    examTimelinesLoaded: true,


    // 通知设置，setting页修改后同步到这里
    notifySettings: {
      activity: true,
      exam: true,
      interaction: true,
      system: true,
    },
    // 当前展示页面路径，用于判断是否在小程序内
    currentPage: '',
  },

  onLaunch() {
    this._loadExamTimelines()
    this._loadNotifySettings()
  },


  onShow() {
    // 每次小程序从后台切回前台，检查新消息
    this._checkInAppNotify()
  },

  // ─── 考试时间线 ────────────────────────────────────────────
  _loadExamTimelines() {
    wx.request({
      url: `${this.BASE_URL}/api/exam/timelines`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          this.globalData.examTimelines = res.data
          this.globalData.examTimelinesLoaded = true
          // 通知已注册的回调（页面比请求先 onLoad 时用）
          this._timelineCallbacks.forEach(cb => cb(res.data))
          this._timelineCallbacks = []
        }
      },
      fail: () => {
        // 请求失败：各页面用静态兜底，不影响使用
        this.globalData.examTimelinesLoaded = true
        this._timelineCallbacks.forEach(cb => cb({}))
        this._timelineCallbacks = []
      }
    })
  },

  // 各页面调用此方法获取 timelines
  // 已加载直接返回，未加载则等待请求完成后回调
  getExamTimelines(callback) {
    if (this.globalData.examTimelinesLoaded) {
      callback(this.globalData.examTimelines)
      return
    }
    // 请求还在进行中，先注册回调
    this._timelineCallbacks.push(callback)
  },

  // 获取单个考试的 timeline
  getExamTimeline(examId, callback) {
    this.getExamTimelines((timelines) => {
      callback(timelines[examId] || [])
    })
  },

  // ─── 通知设置 ──────────────────────────────────────────────
  _loadNotifySettings() {
    try {
      const saved = wx.getStorageSync('settings_notify')
      if (saved) this.globalData.notifySettings = saved
    } catch (e) {}
  },

  // ─── 应用内横幅提醒 ────────────────────────────────────────
  // 检查未读消息，通知当前页面展示横幅
  _checkInAppNotify() {
    // 真实场景：请求 /api/message/unread 拿最新未读消息
    // 这里用模拟数据演示
    // 实际接入时把下面注释去掉换成真实请求
    /*
    wx.request({
      url: `${this.BASE_URL}/api/message/unread`,
      success: (res) => {
        if (res.data && res.data.length) {
          const latest = res.data[0]
          const notifyKey = latest.type  // system/activity/exam/interaction
          if (!this.globalData.notifySettings[notifyKey]) return
          this._broadcastBanner(latest)
        }
      }
    })
    */
  },

  // 广播横幅到当前页面
  // 页面在 onShow 里调用 app.setBannerHandler 注册回调
  _bannerHandler: null,

  setBannerHandler(handler) {
    this._bannerHandler = handler
  },

  clearBannerHandler() {
    this._bannerHandler = null
  },

  _broadcastBanner(msg) {
    if (this._bannerHandler) {
      this._bannerHandler(msg)
    }
  },

  // 供任意页面调用，主动触发横幅
  showInAppBanner(msg) {
    const notifyKey = msg.type
    if (!this.globalData.notifySettings[notifyKey]) return
    this._broadcastBanner(msg)
  },

  // 获取TabBar实例
  getTabBar() {
    return this.globalData.tabBar
  }
})