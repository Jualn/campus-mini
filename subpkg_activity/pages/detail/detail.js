// subpkg_activity/pages/detail/index.js

// ─── 状态计算（和 list 页保持一致） ──────────────────────────
// 放在文件顶部，所有 new Date() 都走这个函数
function parseDate(str) {
  if (!str) return null
  // 把 "2026-03-15 16:00" 转成 "2026-03-15T16:00"，iOS 兼容
  return new Date(str.replace(' ', 'T'))
}

function calcActivityStatus(activity) {
  if (activity.is_cancelled) return 'cancelled'

  const now = new Date()
  const eStart = parseDate(activity.enroll_start)
  const eEnd = parseDate(activity.enroll_deadline)
  const actStart = parseDate(activity.start_time)
  const actEnd = parseDate(activity.end_time)

  if (actEnd && now > actEnd) return 'ended'
  if (actStart && now >= actStart) return 'ongoing'
  if (eEnd && now > eEnd) return 'upcoming'
  if (eEnd && now <= eEnd && (!eStart || now >= eStart)) return 'enrolling'
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

function calcDaysToDeadline(deadline) {
  if (!deadline) return null
  return Math.ceil((parseDate(deadline) - new Date()) / 86400000)
}

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

// 把 "2026-03-16 12:00" 截短为 "3月16日"
function formatShortDate(str) {
  if (!str) return ''
  const d = parseDate(str)
  if (!d || isNaN(d)) return str
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function calcTimelineStatus(dateStr) {
  if (!dateStr) return 'unknown'
  const diff = (new Date(dateStr) - new Date()) / 86400000
  if (diff < -1) return 'done'
  if (diff <= 1) return 'active'
  return 'future'
}

function injectTimelineStatus(timeline) {
  if (!timeline || !timeline.length) return []
  return timeline.map(item => ({
    ...item,
    status: calcTimelineStatus(item.date),
  }))
}

// ─── Mock 数据库，后端接入后换成 wx.request ────────────────
const ACTIVITY_DB = {
  act_001: {
    id: 'act_001',
    title: '2026年春日运动"云"打卡活动',
    cover: '',
    type: '打卡',
    scope: '全院',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '南昌大学科学技术学院学生委员会',
    summary: '面向全院学生开展的春日运动打卡活动，促进学生体质提升',
    description: '本次活动为了体现群众性、广泛性和灵活性，提升覆盖率，采用学科部、团支部抓动员，学院组织分阶段评比的形式。\n\n活动分两个阶段：\n第一阶段：3月16日—3月21日\n第二阶段：3月23日—3月28日\n\n每阶段内进行至少4次打卡，总计不少于8次，打卡时间为6:00-22:00。',
    enroll_start: '',
    enroll_deadline: '2026-03-15 16:00',
    start_time: '2026-03-16',
    end_time: '2026-03-28',
    location: '',
    max_participants: null,
    timeline: [],
    rewards: [],
    join_methods: [{
      type: 'qq',
      label: '加入学科部QQ群',
      group_id: '1087179197',
      note: '信息学科部群号，其他学科部请查看附件3',
    }, ],
    contacts: [{
        name: '曹老师',
        role: '',
        phone: '0791-3561061',
        qq: '',
        email: '',
        note: ''
      },
      {
        name: '叶淑华',
        role: '负责人',
        phone: '15979864226',
        qq: '',
        email: '',
        note: ''
      },
      {
        name: '邹茜',
        role: '负责人',
        phone: '19880238337',
        qq: '',
        email: '',
        note: ''
      },
    ],
    attachments: [{
      type: 'pdf',
      name: '活动通知原文',
      url: '',
      note: '含完整打卡规则和群号'
    }, ],
    series_id: '',
    series_name: '',
    source: '南大科院团联发〔2026〕2号',
    published_at: '2026-03-12',
    published_by: '院团委',
    is_cancelled: false,
  },

  act_002: {
    id: 'act_002',
    title: '共青城市"青年说"宣讲大赛（第1期）',
    cover: '',
    type: '竞赛',
    scope: '信息学科部',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '信息学科部总支委员会',
    summary: '围绕"奋进十五五·讲述共青故事·闪耀青春之光"主题开展宣讲',
    description: '宣讲主题为"奋进\'十五五\'·讲述共青故事·闪耀青春之光"。作品必须为原创，严禁抄袭，支持演讲、情景剧、话剧等各种形式，可搭配PPT、背景视频等辅助素材。\n\n各班级团支书认真组织、严格把关，以班级为单位将参赛材料（报名表+原创作品）报送至指定邮箱。',
    enroll_start: '2026-03-10',
    enroll_deadline: '2026-03-21 22:00',
    start_time: '2026-04-05',
    end_time: '2026-04-10',
    location: '',
    max_participants: null,
    timeline: [{
        label: '报名与作品提交',
        date: '2026-03-31',
        time: '',
        source: '主办方通知',
        note: '即日起至3月31日'
      },
      {
        label: '线上初评',
        date: '2026-04-05',
        time: '',
        source: '主办方通知',
        note: '择优30名进入线下决赛'
      },
      {
        label: '线下决赛',
        date: '',
        time: '',
        source: '主办方通知',
        note: '4月上旬，具体另行通知'
      },
    ],
    rewards: [{
        level: '一等奖',
        count: 1,
        prize: '',
        note: ''
      },
      {
        level: '二等奖',
        count: 3,
        prize: '',
        note: ''
      },
      {
        level: '三等奖',
        count: 6,
        prize: '',
        note: ''
      },
      {
        level: '优秀奖',
        count: null,
        prize: '',
        note: '若干名'
      },
    ],
    join_methods: [{
      type: 'email',
      label: '邮件提交参赛材料',
      email: 'xxtzzyx@163.com',
      note: '命名格式：专业班级+共青城市"青年说"宣讲大赛\n例：电子信息工程252班共青城市"青年说"宣讲大赛',
    }, ],
    contacts: [{
        name: '于丹彤',
        role: '',
        phone: '18829730268',
        qq: '',
        email: '',
        note: ''
      },
      {
        name: '李杨',
        role: '',
        phone: '19379558755',
        qq: '',
        email: '',
        note: ''
      },
    ],
    attachments: [{
        type: 'pdf',
        name: '宣讲大赛预通知',
        url: '',
        note: '含参考选题和参赛要求'
      },
      {
        type: 'doc',
        name: '报名推荐表',
        url: '',
        note: '下载填写后随材料提交'
      },
    ],
    series_id: '',
    series_name: '',
    source: '信团发〔2026〕10号',
    published_at: '2026-03-10',
    published_by: '信息学科部团总支',
    is_cancelled: false,
  },

  act_003: {
    id: 'act_003',
    title: '"清润明德，锋暖校园"志愿服务活动',
    cover: '',
    type: '志愿',
    scope: '全院',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '信息学科部总支委员会',
    summary: '对明德楼进行卫生清扫、杂物整理、环境清洁志愿服务，志愿时长2小时',
    description: '志愿者将对明德楼（靠北门）部分教室、走廊、楼梯、公共区域等进行全面清洁整理，以实际行动改善校园学习环境。\n\n注意事项：\n· 参与人员需准时到达指定集合地点，不迟到、不早退\n· 需穿着适宜的服装，注意个人安全\n· 正确规范使用清洁工具，不喧哗打闹',
    enroll_start: '2026-03-04 12:00',
    enroll_deadline: '2026-03-04 18:00',
    start_time: '2026-03-06 12:00',
    end_time: '2026-03-06 13:00',
    location: '明德楼（靠北门）',
    max_participants: 65,
    timeline: [],
    rewards: [{
      level: '志愿时长',
      count: null,
      prize: '2小时',
      note: '完成活动后认定'
    }, ],
    join_methods: [{
        type: 'qrcode',
        label: '扫码报名',
        image_url: '',
        note: '按要求填写报名信息（学科部、专业班级需填写全称）',
      },
      {
        type: 'qq',
        label: '加入活动QQ群',
        group_id: '1083622602',
        note: '填写报名信息后及时加入群，活动相关事宜将在群内通知',
      },
    ],
    contacts: [],
    attachments: [{
      type: 'pdf',
      name: '雷锋月系列活动方案',
      url: '',
      note: '含完整活动安排'
    }, ],
    series_id: 'series_leifeng_2026',
    series_name: '雷锋月系列活动',
    source: '信团发〔2026〕7号',
    published_at: '2026-03-02',
    published_by: '信息学科部团总支',
    is_cancelled: false,
  },

  act_004: {
    id: 'act_004',
    title: '"拒绝舌尖浪费，争做光盘达人"主题活动',
    cover: '',
    type: '打卡',
    scope: '全院',
    organizer: '共青团南昌大学科学技术学院委员会',
    co_organizer: '青年志愿者协会',
    summary: '依托"光盘打卡"小程序开展节粮行动，在活动时间内连续有效打卡21天视为完成',
    description: '本次活动主要依托"光盘打卡"小程序进行节粮行动，参与人员采取自主报名方式。\n\n打卡要求：\n· 每天至少有效打卡1次，每次打卡需间隔2小时以上\n· 在活动时间内连续有效参与21天并正确上传相关信息，则视为活动完成\n· 禁止弄虚作假，一经发现所有打卡天数作废\n\n活动结束后需在3月25日—3月31日内填写信息收集表并上传打卡图片。',
    enroll_start: '',
    enroll_deadline: '2026-03-04 22:00',
    start_time: '2026-03-04',
    end_time: '2026-03-24',
    location: '',
    max_participants: null,
    timeline: [{
        label: '活动打卡期',
        date: '2026-03-04',
        time: '',
        source: '活动通知',
        note: '3月4日—3月24日'
      },
      {
        label: '信息收集截止',
        date: '2026-03-31',
        time: '',
        source: '活动通知',
        note: '需上传打卡记录截图'
      },
    ],
    rewards: [],
    join_methods: [{
        type: 'wechat',
        label: '关注公众号参与',
        account: '南大科院青志协',
        note: '关注后点击"常规活动"-"光盘打卡"，选择所在学科部分组后开始打卡',
      },
      {
        type: 'link',
        label: '填写信息收集表',
        url: 'https://f.kdocs.cn/g/oTUGCq9r',
        note: '活动结束后（3月25日—31日）填写',
      },
    ],
    contacts: [],
    attachments: [{
      type: 'pdf',
      name: '光盘打卡操作指引',
      url: '',
      note: '含详细操作步骤截图'
    }, ],
    series_id: 'series_leifeng_2026',
    series_name: '雷锋月系列活动',
    source: '信团发〔2026〕7号',
    published_at: '2026-03-02',
    published_by: '信息学科部团总支',
    is_cancelled: false,
  },
}
// ──────────────────────────────────────────────────────────

Page({
  data: {
    statusBarHeight: 20,
    activity: {},
  },

  onLoad(options) {
    const sys = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sys.statusBarHeight
    })
    this._loadActivity(options.id)
  },

  _loadActivity(id) {
    // 真实场景：wx.request({ url: `/api/activity/detail/${id}` })
    const raw = ACTIVITY_DB[id]
    if (!raw) {
      wx.showToast({
        title: '活动不存在',
        icon: 'none'
      })
      return
    }

    const status = calcActivityStatus(raw)
    const typeInfo = TYPE_MAP[raw.type] || {
      color: 'default',
      icon: '📌'
    }
    const activity = {
      ...raw,
      status,
      statusLabel: STATUS_LABEL[status],
      daysToDeadline: calcDaysToDeadline(raw.enroll_deadline),
      timeline: injectTimelineStatus(raw.timeline),
      typeColor: typeInfo.color,
      typeIcon: typeInfo.icon,
      startDateShort: formatShortDate(raw.start_time),
    }

    this.setData({
      activity
    })
    wx.setNavigationBarTitle({
      title: raw.title
    })
  },

  // 复制文本
  onCopy(e) {
    const {
      text,
      label
    } = e.currentTarget.dataset
    if (!text) return
    wx.setClipboardData({
      data: String(text),
      success: () => wx.showToast({
        title: `${label || ''}已复制`,
        icon: 'success'
      }),
    })
  },

  // 打开链接
  onOpenLink(e) {
    const {
      url,
      label
    } = e.currentTarget.dataset
    wx.showModal({
      title: label || '即将跳转',
      content: '将在微信内置浏览器中打开',
      confirmText: '前往',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        wx.openUrl ?
          wx.openUrl({
            url
          }) :
          wx.setClipboardData({
            data: url,
            success: () => wx.showToast({
              title: '链接已复制',
              icon: 'none'
            }),
          })
      },
    })
  },

  // 打开附件
  onOpenAttachment(e) {
    const {
      url,
      type,
      name
    } = e.currentTarget.dataset
    if (!url) {
      wx.showToast({
        title: '文件暂未上传',
        icon: 'none'
      })
      return
    }
    if (type === 'image') {
      wx.previewImage({
        urls: [url],
        current: url
      })
      return
    }
    wx.showLoading({
      title: '加载中...'
    })
    wx.downloadFile({
      url,
      success: (res) => {
        wx.hideLoading()
        wx.openDocument({
          filePath: res.tempFilePath,
          fileName: name,
          showMenu: true,
          fail: () => wx.showToast({
            title: '无法打开文件',
            icon: 'none'
          }),
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '文件加载失败',
          icon: 'none'
        })
      },
    })
  },

  // 底部按钮滚动到报名方式区域
  onScrollToJoin() {
    if (this.data.activity.status === 'enrolling') {
      wx.pageScrollTo({
        selector: '.join-list',
        offsetTop: -20,
        duration: 300,
      })
    }
  },

  onBack() {
    wx.navigateBack()
  },
})