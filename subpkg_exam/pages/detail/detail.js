// subpkg_exam/pages/detail/index.js

// ─── Mock 数据库，后端接入后换成 wx.request ────────────────
//
// timeline 每条字段说明：
//   label   显示名称
//   date    日期字符串，空字符串表示待公告
//   time    时分字符串（如 '09:00'），无则留空
//   status  done/active/future/unknown
//           unknown = 时间未定，显示虚线圆点 + "待通知"
//   source  来源角标，可自定义：'教育部公告'/'各省教育局'/'学校教务处' 等
//   note    橙色备注，用于往年规律提示或补充说明，留空不显示
//
// timeSource  整个时间区底部的来源总说明，后台可自定义

const EXAM_DB = {

  cet4: {
    id: 'cet4',
    name: '英语四级',
    icon: '📖',
    color: 'blue',
    organizer: '教育部考试中心',
    tagline: '教育部主办的全国大学英语水平测试',
    frequency: '每年6月、12月各一次，通常3月和9月开放报名',
    timeSource: '本期时间仅供参考，请以教育部考试中心当年公告为准！！！',
    timeline: [{
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
    info: [{
        label: '主办方',
        value: '教育部考试中心'
      },
      {
        label: '满分',
        value: '710分'
      },
      {
        label: '考试费用',
        value: '约25元（各省标准不同）'
      },
      {
        label: '证书用途',
        value: '求职、升学、部分学校毕业要求'
      },
    ],
    subjects: [{
        name: '写作',
        score: '106.5分',
        desc: '命题作文'
      },
      {
        name: '听力',
        score: '248.5分',
        desc: '长对话、听力理解、讲座报告'
      },
      {
        name: '阅读',
        score: '248.5分',
        desc: '词汇理解、长篇阅读、仔细阅读'
      },
      {
        name: '翻译',
        score: '106.5分',
        desc: '汉译英段落翻译'
      },
    ],
    mustKnow: [
      '须持有效居民身份证原件入场，不接受其他证件',
      '考试全程禁止携带手机及任何电子设备',
      '迟到15分钟后不得入场',
      '具体入场规定请以当年准考证及考生须知为准',
    ],
    links: [{
        icon: '📋',
        label: '官方报名网站',
        desc: '报名、缴费、准考证下载',
        url: 'https://cet.neea.edu.cn',
        primary: true
      },
      {
        icon: '📊',
        label: '成绩查询',
        desc: '考后可在此查询本人成绩',
        url: 'https://cet.neea.edu.cn'
      },
      {
        icon: '📄',
        label: '考生手册',
        desc: '官方规则与完整注意事项',
        url: 'https://cet.neea.edu.cn'
      },
      {
        icon: '🎓',
        label: '证书查验',
        desc: '学信网验证证书真伪',
        url: 'https://www.chsi.com.cn'
      },
    ],
  },

  cet6: {
    id: 'cet6',
    name: '英语六级',
    icon: '📗',
    color: 'blue',
    organizer: '教育部考试中心',
    tagline: '教育部主办的全国大学英语水平测试',
    frequency: '每年6月、12月各一次，通常3月和9月开放报名',
    timeSource: '本期时间仅供参考，请以教育部考试中心当年公告为准！！！',
    timeline: [{
        label: '网上报名',
        date: '2025-03-01',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '报名截止',
        date: '2025-03-31',
        time: '23:59',
        source: '教育部公告',
        note: ''
      },
      {
        label: '准考证打印',
        date: '2025-06-07',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '笔试',
        date: '2025-06-14',
        time: '09:00',
        source: '教育部公告',
        note: ''
      },
      {
        label: '成绩查询',
        date: '',
        time: '',
        source: '教育部公告',
        note: '往年通常在笔试后3-4周，以教育部公告为准'
      },
    ],
    info: [{
        label: '主办方',
        value: '教育部考试中心'
      },
      {
        label: '满分',
        value: '710分'
      },
      {
        label: '考试费用',
        value: '约25元（各省标准不同）'
      },
      {
        label: '证书用途',
        value: '求职、升学、研究生入学参考'
      },
    ],
    subjects: [{
        name: '写作',
        score: '106.5分',
        desc: '命题作文'
      },
      {
        name: '听力',
        score: '248.5分',
        desc: '长对话、听力理解、讲座报告'
      },
      {
        name: '阅读',
        score: '248.5分',
        desc: '词汇理解、长篇阅读、仔细阅读'
      },
      {
        name: '翻译',
        score: '106.5分',
        desc: '汉译英段落翻译'
      },
    ],
    mustKnow: [
      '须持有效居民身份证原件入场',
      '考试全程禁止携带手机及任何电子设备',
      '迟到15分钟后不得入场',
      '具体规定请以当年准考证及考生须知为准',
    ],
    links: [{
        icon: '📋',
        label: '官方报名网站',
        desc: '报名、缴费、准考证下载',
        url: 'https://cet.neea.edu.cn',
        primary: true
      },
      {
        icon: '📊',
        label: '成绩查询',
        desc: '考后可在此查询本人成绩',
        url: 'https://cet.neea.edu.cn'
      },
      {
        icon: '📄',
        label: '考生手册',
        desc: '官方规则与完整注意事项',
        url: 'https://cet.neea.edu.cn'
      },
      {
        icon: '🎓',
        label: '证书查验',
        desc: '学信网验证证书真伪',
        url: 'https://www.chsi.com.cn'
      },
    ],
  },

  putonghua: {
    id: 'putonghua',
    name: '普通话水平测试',
    icon: '🗣️',
    color: 'orange',
    organizer: '教育部语言文字工作委员会',
    tagline: '教育部语言文字工作委员会组织的普通话等级测试',
    frequency: '各地全年滚动安排，具体场次以当地测试机构通知为准',
    timeSource: '报名及考试时间以各地语言文字工作委员会或测试机构通知为准',
    timeline: [{
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
    info: [{
        label: '主办方',
        value: '教育部语言文字工作委员会'
      },
      {
        label: '等级划分',
        value: '一甲、一乙、二甲、二乙、三甲、三乙'
      },
      {
        label: '考试费用',
        value: '各地不同，以当地通知为准'
      },
      {
        label: '证书用途',
        value: '教师资格、播音主持、部分职业上岗要求'
      },
    ],
    subjects: [{
        name: '读单音节字词',
        score: '',
        desc: '100个字词，限时3.5分钟'
      },
      {
        name: '读多音节词语',
        score: '',
        desc: '100个词语，限时2.5分钟'
      },
      {
        name: '朗读短文',
        score: '',
        desc: '400字短文，限时4分钟'
      },
      {
        name: '命题说话',
        score: '',
        desc: '就指定话题说话，限时3分钟'
      },
    ],
    mustKnow: [
      '须持有效身份证件参加测试',
      '部分地区采用机器测试，请提前了解当地安排',
      '具体测试规定以当地测试机构通知为准',
    ],
    links: [{
        icon: '📋',
        label: '全国普通话培训测试网',
        desc: '查询报名及相关信息',
        url: 'https://www.cltt.org',
        primary: true
      },
      {
        icon: '📄',
        label: '等级标准说明',
        desc: '了解各等级划分标准',
        url: 'https://www.cltt.org'
      },
    ],
  },

  ncre: {
    id: 'ncre',
    name: '全国计算机等级考试',
    icon: '💻',
    color: 'purple',
    organizer: '教育部考试中心',
    tagline: '教育部考试中心主办的计算机应用能力考试',
    frequency: '每年3月和9月各举办一次',
    timeSource: '本期时间以教育部考试中心当年公告为准',
    timeline: [{
        label: '网上报名',
        date: '2025-07-01',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '报名截止',
        date: '2025-07-31',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '上机考试',
        date: '2025-09-20',
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
    info: [{
        label: '主办方',
        value: '教育部考试中心'
      },
      {
        label: '级别划分',
        value: '一级至四级，各级考查方向不同'
      },
      {
        label: '考试费用',
        value: '各地不同，以当地通知为准'
      },
      {
        label: '考试形式',
        value: '上机考试'
      },
      {
        label: '证书用途',
        value: '就业、升学、部分职业上岗要求'
      },
    ],
    subjects: [{
        name: '一级',
        score: '',
        desc: '计算机基础及办公软件'
      },
      {
        name: '二级',
        score: '',
        desc: '程序设计及办公软件高级应用'
      },
      {
        name: '三级',
        score: '',
        desc: '网络技术、数据库、信息安全等方向'
      },
      {
        name: '四级',
        score: '',
        desc: '网络工程师、数据库工程师等方向'
      },
    ],
    mustKnow: [
      '须持有效居民身份证原件入场',
      '不同级别考试科目不同，报名前请确认所报级别',
      '具体规定请以当年准考证及考生须知为准',
    ],
    links: [{
        icon: '📋',
        label: '官方报名网站',
        desc: '报名、缴费、准考证下载',
        url: 'https://ncre.neea.edu.cn',
        primary: true
      },
      {
        icon: '📊',
        label: '成绩查询',
        desc: '考后可在此查询本人成绩',
        url: 'https://ncre.neea.edu.cn'
      },
      {
        icon: '📄',
        label: '考试大纲',
        desc: '各级别考试范围与要求',
        url: 'https://ncre.neea.edu.cn'
      },
    ],
  },

  teacher: {
    id: 'teacher',
    name: '教师资格证',
    icon: '🏫',
    color: 'green',
    organizer: '教育部考试中心',
    tagline: '教育部统一组织的教师职业资格认定考试',
    frequency: '笔试每年3月、11月各一次，面试由各省另行安排',
    timeSource: '笔试时间以教育部公告为准，面试时间以各省教育局通知为准',
    timeline: [{
        label: '笔试报名',
        date: '2025-09-01',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '报名截止',
        date: '2025-09-30',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '准考证打印',
        date: '',
        time: '',
        source: '教育部公告',
        note: '往年通常在笔试前一周，以官方公告为准'
      },
      {
        label: '笔试',
        date: '2025-11-01',
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
    info: [{
        label: '主办方',
        value: '教育部考试中心'
      },
      {
        label: '学段分类',
        value: '幼儿园、小学、初中、高中及中职'
      },
      {
        label: '考试阶段',
        value: '笔试（全国统一）+ 面试（各省组织）'
      },
      {
        label: '证书用途',
        value: '从事教师职业的必备资格证书'
      },
    ],
    subjects: [{
        name: '综合素质',
        score: '',
        desc: '职业理念、法律法规、文化素养等（所有学段）'
      },
      {
        name: '教育知识与能力',
        score: '',
        desc: '教育学、心理学基础等（所有学段）'
      },
      {
        name: '学科知识与能力',
        score: '',
        desc: '对应学科专业知识（高中/中职需考）'
      },
    ],
    mustKnow: [
      '须持有效居民身份证原件入场',
      '笔试和面试需分别报名，笔试通过后方可报名面试',
      '各学段报考科目不同，报名前请确认所报学段',
      '具体规定请以当年准考证及考生须知为准',
    ],
    links: [{
        icon: '📋',
        label: '中国教师资格网',
        desc: '报名、准考证、成绩查询',
        url: 'https://ntce.neea.edu.cn',
        primary: true
      },
      {
        icon: '📄',
        label: '考试标准与大纲',
        desc: '各学段考试内容与要求',
        url: 'https://ntce.neea.edu.cn'
      },
    ],
  },

  kaoyan: {
    id: 'kaoyan',
    name: '全国硕士研究生考试',
    icon: '🎓',
    color: 'red',
    organizer: '教育部',
    tagline: '教育部主管的全国统一硕士研究生招生考试',
    frequency: '每年12月下旬举行，10月开放网上报名',
    timeSource: '初试时间以教育部公告为准，复试时间以各招生院校通知为准',
    timeline: [{
        label: '预报名',
        date: '2025-09-24',
        time: '',
        source: '教育部公告',
        note: '仅限应届本科生，非必须'
      },
      {
        label: '正式报名',
        date: '2025-10-01',
        time: '',
        source: '教育部公告',
        note: ''
      },
      {
        label: '报名截止',
        date: '2025-10-31',
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
        date: '2025-12-14',
        time: '',
        source: '教育部公告',
        note: '在研招网下载打印'
      },
      {
        label: '初试第一天',
        date: '2025-12-20',
        time: '08:30',
        source: '教育部公告',
        note: '政治、外语'
      },
      {
        label: '初试第二天',
        date: '2025-12-21',
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
    info: [{
        label: '主办方',
        value: '教育部'
      },
      {
        label: '考试阶段',
        value: '初试（全国统一）+ 复试（各校自行组织）'
      },
      {
        label: '公共科目',
        value: '政治、英语（或其他外语）'
      },
      {
        label: '专业科目',
        value: '因专业和院校而异，请查阅目标院校招生简章'
      },
      {
        label: '报名费用',
        value: '约80-120元（各省不同）'
      },
    ],
    subjects: [{
        name: '思想政治理论',
        score: '100分',
        desc: '全国统考，所有考生必考'
      },
      {
        name: '外语',
        score: '100分',
        desc: '英语一/英语二/俄语等，因专业而异'
      },
      {
        name: '业务课一',
        score: '150分',
        desc: '因专业和院校不同，请查阅招生简章'
      },
      {
        name: '业务课二',
        score: '150分',
        desc: '因专业和院校不同，请查阅招生简章'
      },
    ],
    mustKnow: [
      '须持准考证及有效居民身份证双证入场',
      '报名信息一经确认不可更改，请仔细核对院校、专业、考点信息',
      '专业课科目因院校和专业不同差异较大，请以目标院校招生简章为准',
      '具体规定请以当年准考证及考生须知为准',
    ],
    links: [{
        icon: '📋',
        label: '中国研究生招生信息网',
        desc: '报名、准考证、成绩、调剂',
        url: 'https://yz.chsi.com.cn',
        primary: true
      },
      {
        icon: '📊',
        label: '成绩查询与复核',
        desc: '初试成绩查询及复核申请',
        url: 'https://yz.chsi.com.cn'
      },
      {
        icon: '📋',
        label: '国家线与调剂信息',
        desc: '历年国家线及调剂系统',
        url: 'https://yz.chsi.com.cn'
      },
    ],
  },
}
// ──────────────────────────────────────────────────────────

// 根据日期自动计算 status，不需要手动维护
// unknown → 没有日期（待公告）
// done    → 已过去超过1天
// active  → 今天或明天以内（进行中/即将）
// future  → 未来
function calcTimelineStatus(dateStr) {
  if (!dateStr) return 'unknown'
  const diff = (new Date(dateStr) - new Date()) / 86400000
  if (diff < -1) return 'done'
  if (diff <= 1) return 'active'
  return 'future'
}

// 给整个 timeline 数组批量注入计算后的 status
function injectStatus(timeline) {
  return timeline.map(item => ({
    ...item,
    status: calcTimelineStatus(item.date),
  }))
}

function calcDaysLeft(dateStr) {
  if (!dateStr) return 0
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  return diff > 0 ? diff : 0
}

// 从 timeline 找报名开始/截止推算报名状态
function calcEnrollStatusFromTimeline(timeline) {
  const start = timeline.find(t =>
    t.label.includes('报名') &&
    !t.label.includes('截止') &&
    !t.label.includes('确认') &&
    !t.label.includes('面试')
  )?.date
  const end = timeline.find(t =>
    t.label.includes('截止')
  )?.date

  if (!start || !end) return 'unknown'
  const now = new Date()
  if (now >= new Date(start) && now <= new Date(end)) return 'open'
  if (now < new Date(start)) return 'upcoming'
  return 'closed'
}

// 从 timeline 找最近的考试日期（笔试/考试/初试）
function findExamDate(timeline) {
  return timeline.find(t =>
    t.date && (
      t.label.includes('笔试') ||
      t.label.includes('考试') ||
      t.label.includes('初试') ||
      t.label.includes('测试')
    )
  )?.date || ''
}

Page({
  data: {
    statusBarHeight: 20,
    exam: {},
    collected: false,
  },

  onLoad(options) {
    const sys = wx.getWindowInfo()
    this.setData({
      statusBarHeight: sys.statusBarHeight
    })
    this._loadExam(options.examId)
    this._checkCollected(options.examId)
  },

  _loadExam(examId) {
    const raw = EXAM_DB[examId]
    if (!raw) {
      wx.showToast({
        title: '暂无该考试信息',
        icon: 'none'
      })
      return
    }

    // 先用静态数据渲染，页面立刻有内容
    this.setData({
      exam: {
        ...raw,
        timeline: []
      }
    })

    // 从 globalData 取 timeline（app.js 启动时已请求）
    const app = getApp()
    app.getExamTimeline(examId, (rawTimeline) => {
      // 有动态数据用动态，没有用静态兜底
      const source = rawTimeline.length ? rawTimeline : raw.timeline
      const timeline = injectStatus(source)
      const examDate = findExamDate(timeline)

      this.setData({
        'exam.timeline': timeline,
        'exam.enrollStatus': calcEnrollStatusFromTimeline(timeline),
        'exam.daysLeft': calcDaysLeft(examDate),
      })
    })
  },

  _checkCollected(examId) {
    try {
      const list = wx.getStorageSync('exam_collected') || []
      this.setData({
        collected: list.includes(examId)
      })
    } catch (e) {}
  },

  onToggleCollect() {
    const examId = this.data.exam.id
    try {
      let list = wx.getStorageSync('exam_collected') || []
      if (list.includes(examId)) {
        list = list.filter(id => id !== examId)
        wx.showToast({
          title: '已取消关注',
          icon: 'none'
        })
      } else {
        list.push(examId)
        wx.showToast({
          title: '已加入关注',
          icon: 'success'
        })
      }
      wx.setStorageSync('exam_collected', list)
      this.setData({
        collected: !this.data.collected
      })
    } catch (e) {}
  },

  onOpenLink(e) {
    const {
      url,
      label
    } = e.currentTarget.dataset
    wx.showModal({
      title: label,
      content: '即将在微信内置浏览器中打开官方网站',
      confirmText: '前往',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        if (wx.openUrl) {
          wx.openUrl({
            url
          })
        } else {
          wx.setClipboardData({
            data: url,
            success: () => wx.showToast({
              title: '链接已复制',
              icon: 'none'
            }),
          })
        }
      },
    })
  },

  onEnroll() {
    const {
      enrollStatus,
      links
    } = this.data.exam
    if (enrollStatus !== 'open') {
      wx.showToast({
        title: enrollStatus === 'upcoming' ? '报名尚未开始' : '本期报名已结束',
        icon: 'none',
      })
      return
    }
    const primaryLink = links.find(l => l.primary)
    if (!primaryLink) return
    wx.showModal({
      title: '前往官方报名',
      content: '即将在微信内置浏览器中打开官方报名网站',
      confirmText: '前往报名',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return
        if (wx.openUrl) {
          wx.openUrl({
            url: primaryLink.url
          })
        } else {
          wx.setClipboardData({
            data: primaryLink.url,
            success: () => wx.showToast({
              title: '报名链接已复制',
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