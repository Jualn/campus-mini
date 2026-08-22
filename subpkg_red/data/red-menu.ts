import type { RedCategory, RedStructureItem } from '../types/red';

export const RED_STRUCTURE: RedStructureItem[] = [
  {
    id: 'work-mechanism',
    title: '工作机制',
    summary: '沉淀红色模块的运行规则、任务认领和活动复盘机制。',
  },
  {
    id: 'position-building',
    title: '阵地建设',
    summary: '承载学习阵地、服务阵地和线上展示阵地。',
  },
  {
    id: 'activity-scene',
    title: '活动场景',
    summary: '把学习、服务、实践、共创等内容按场景组织。',
  },
];

export const RED_CATEGORIES: RedCategory[] = [
  {
    id: 1,
    key: 'study',
    title: '学习型',
    subtitle: '理论学习、作风建设、红色书香',
    summary: '围绕红色理论、纪律教育和学习阵地，形成可持续更新的学习目录。',
    items: [
      {
        id: 'immersive-micro-party-class',
        title: '沉浸式党史竞赛',
        summary: '用互动问答承载主题教育内容。',
        tags: ['微党课'],
      },
      {
        id: 'style-building-time-machine',
        title: '作风建设时光机',
        summary: '沉淀作风建设、纪律教育、案例学习等专题内容。',
        tags: ['作风建设'],
      },
      {
        id: 'red-book-corner',
        title: '红色书角',
        summary: '集中展示红色经典、理论书籍、学习资料和推荐书单。',
        children: [
          { id: 'classic-reading', title: '红色经典' },
          { id: 'clean-reading-list', title: '清风书单' },
          { id: 'reading-record', title: '学习记录' },
        ],
      },
      {
        id: 'books',
        title: '清风书单',
        summary: '',
      },
      {
        id: 'eight-rules-topic',
        title: '纪律规矩大家谈',
        summary: '',
        tags: ['专题'],
      },
    ],
  },
  {
    id: 2,
    key: 'service',
    title: '服务型',
    subtitle: '志愿服务、专业服务、便民支持',
    summary: '把面向师生的志愿服务和专业服务沉淀成稳定入口。',
    items: [
      {
        id: 'info-e-red-volunteer',
        title: '“信息红”党员先锋志愿服务队',
        summary: '结合信息类专业特色，组织线上线下志愿服务。',
        tags: ['特色'],
      },
      {
        id: 'e-secury',
        title: '“E-安全”工作小组',
        summary: '',
      },
      {
        id: 'computer-clinic',
        title: '电脑义诊活动',
        summary: '面向师生提供电脑维护、系统排查和基础技术支持。',
      },
      {
        id: 'network-security-week',
        title: '党员寝室挂牌仪式',
        summary: '',
      },
      {
        id: 'service-checkin',
        title: '数字时代不落伍',
        summary: '',
      },
    ],
  },
  {
    id: 3,
    key: 'activity',
    title: '活力型',
    subtitle: '签到墙、主题活动、经验分享',
    summary: '用于承载红色主题活动的组织、展示和复盘。',
    items: [
      {
        id: 'activity-checkin-wall',
        title: '活动签到墙',
        summary: '后续可接活动报名、签到、照片墙和活动回顾。',
      },
      {
        id: 'lanqiaobei',
        title: '竞赛活动',
        summary: '',
      },
      {
        id: 'ff',
        title: '攻坚克难主题党日',
        summary: '',
      },
      {
        id: 'experience-sharing',
        title: '经验分享会',
        summary: '沉淀优秀个人、优秀团队和基层实践经验。',
      },
      {
        id: 'theme-red-activity',
        title: '成果展示交流活动',
        summary: '',
      },
    ],
  },
  {
    id: 4,
    key: 'convenience',
    title: '传承型',
    subtitle: '反馈、答疑、成长档案',
    summary: '把师生常用的反馈、答疑和服务记录放到统一入口。',
    items: [
      {
        id: 'service-pioneer-collection',
        title: '基层服务先锋库',
        summary: '展示服务典型、先进事迹和先锋案例。',
      },
      {
        id: 'feedback-post',
        title: '汇青讲坛',
        summary: '',
      },
      {
        id: 'original-heart-answer',
        title: '基层传承讲堂',
        summary: '',
      },
      {
        id: 'growth-profile1',
        title: '行业分享会',
        summary: '',
      },
      {
        id: 'growth-profile2',
        title: '“六心”典型案例',
        summary: '',
      },
      {
        id: 'growth-profile3',
        title: '政治生日',
        summary: '',
      },
      {
        id: 'growth-profile4',
        title: '党员成长档案',
        summary: '',
      },
    ],
  },
  {
    id: 5,
    key: 'innovation',
    title: '创新型',
    subtitle: '数字党建、专业赋能、共创实践',
    summary: '结合信息类专业能力，把红色内容做成更轻量的数字化产品。',
    items: [
      {
        id: 'idea-collision',
        title: '思 WE 大碰砰',
        summary: '面向学生开展创意共创、项目脑暴和数字党建原型设计。',
        tags: ['每月一次'],
      },
      {
        id: 'red-micro-video',
        title: '红色微视频',
        summary: '用短视频、微访谈、微课程表达红色主题。',
      },
      {
        id: 'digital-party-building',
        title: '数字党建实践',
        summary: '',
      },
    ],
  },
  {
    id: 6,
    key: 'practice',
    title: '实践型',
    subtitle: '三下乡、返家乡、社会实践',
    summary: '沉淀实践活动入口、材料归档和成果展示。',
    items: [
      {
        id: 'xibu',
        title: '西部计划',
        summary: '',
      },
      {
        id: 'red-worker',
        title: '红色走读',
        summary: '',
      },
      {
        id: 'three-rural',
        title: '三下乡',
        summary: '暑期社会实践、基层调研和志愿服务成果展示。',
      },
      {
        id: 'return-home',
        title: '返家乡',
        summary: '返乡实践、社区服务、基层治理参与和实践记录。',
      },
      {
        id: 'red-practice-materials',
        title: '红色实践材料',
        summary: '收纳实践方案、过程资料、新闻稿、总结材料和图片记录。',
      },
      {
        id: 'practice-achievements',
        title: '实践成果展示',
        summary: '展示调研报告、实践风采、优秀案例和后续转化成果。',
      },
    ],
  },
];

export const DEFAULT_RED_CATEGORY = RED_CATEGORIES[0];
