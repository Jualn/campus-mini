// subpkg_red/pages/index/index.ts

type CategoryKey =
  | 'study'
  | 'service'
  | 'inheritance'
  | 'vitality'
  | 'innovation'
  | 'practice'
  | 'partyBranch';

interface TypeChildItem {
  id: string;
  name: string;
  desc?: string;
  path?: string;
  tag?: string;
}

interface TypeMenuItem {
  id: string;
  name: string;
  desc?: string;
  path?: string;
  tag?: string;

  /**
   * 预留小类扩展：
   * 后续如果一级事项下面还要分小类，直接往 children 里加即可。
   */
  children?: TypeChildItem[];
}

interface TypeCategory {
  id: number;
  key: CategoryKey;
  title: string;
  slogan: string;
  items: TypeMenuItem[];
}

interface PageData {
  activeMenuKey: CategoryKey;
  menuList: TypeCategory[];
  currentMenu: TypeCategory;
}

interface PageCustom {
  switchMenu: (e: WechatMiniprogram.BaseEvent<{ key: CategoryKey }>) => void;
  onItemClick: (e: WechatMiniprogram.BaseEvent<{ item: TypeMenuItem }>) => void;
  onChildItemClick: (e: WechatMiniprogram.BaseEvent<{ item: TypeChildItem }>) => void;
  handleNavigate: (item: TypeMenuItem | TypeChildItem) => void;
}

const MENU_LIST: TypeCategory[] = [
  {
    id: 1,
    key: 'study',
    title: '学习',
    slogan: '理论学习、主题教育、书香支部',
    items: [
      {
        id: 'study-red-book-corner',
        name: '红色书角',
        desc: '红色经典、理论书籍、学习资料集中展示',
        children: [
          { id: 'study-red-book-list', name: '书目推荐', desc: '后续可接书单列表' },
          { id: 'study-red-book-record', name: '学习记录', desc: '后续可接学习打卡' },
        ],
      },
      {
        id: 'study-clean-book-list',
        name: '清风书单',
        desc: '廉洁教育、作风建设相关学习内容',
      },
      {
        id: 'study-eight-rules',
        name: '中央八项规定',
        desc: '专题学习、案例教育与纪律要求',
      },
    ],
  },
  {
    id: 2,
    key: 'service',
    title: '服务',
    slogan: '志愿服务、便民服务、服务师生',
    items: [
      {
        id: 'service-info-red-volunteer',
        name: '“信息红”志愿服务',
        desc: '结合专业特色开展志愿服务活动',
        tag: '特色',
      },
      {
        id: 'service-computer-clinic',
        name: '电脑义诊',
        desc: '面向师生提供电脑维护与技术支持',
      },
      {
        id: 'service-west-plan',
        name: '西部计划',
        desc: '服务基层、服务西部相关活动入口',
      },
    ],
  },
  {
    id: 3,
    key: 'inheritance',
    title: '传承',
    slogan: '红色传承、精神传承、文化传承',
    items: [
      {
        id: 'inheritance-red-walk',
        name: '红色走读',
        desc: '走访红色地标，传承红色基因',
      },
      {
        id: 'inheritance-grassroots-lecture',
        name: '基层传承讲堂',
        desc: '邀请先进典型、基层代表开展分享',
      },
      {
        id: 'inheritance-red-script',
        name: '红色剧本杀',
        desc: '用青年化方式增强红色教育体验感',
      },
    ],
  },
  {
    id: 4,
    key: 'vitality',
    title: '活力',
    slogan: '青春活力、互动交流、组织凝聚',
    items: [
      {
        id: 'vitality-siwe-pengpeng',
        name: '思WE大碰砰',
        desc: '思想碰撞、观点交流、青年互动活动',
      },
      {
        id: 'vitality-discipline-talk',
        name: '纪律规矩大家谈',
        desc: '围绕纪律规矩开展交流研讨',
      },
      {
        id: 'vitality-growth-activity',
        name: '青春主题活动',
        desc: '后续可扩展文体、交流、团建类活动',
        children: [
          { id: 'vitality-salon', name: '主题沙龙' },
          { id: 'vitality-share', name: '成长分享' },
        ],
      },
    ],
  },
  {
    id: 5,
    key: 'innovation',
    title: '创新',
    slogan: '专业赋能、数字党建、创新实践',
    items: [
      {
        id: 'innovation-anti-fraud-video',
        name: '反诈微视频',
        desc: '用短视频形式开展反诈宣传',
      },
      {
        id: 'innovation-cyber-security-week',
        name: '网络安全宣传周',
        desc: '结合信息类专业开展网络安全教育',
      },
      {
        id: 'innovation-digital-party-building',
        name: '数字党建实践',
        desc: '后续可接入数字平台、AI助手、数据看板等模块',
      },
    ],
  },
  {
    id: 6,
    key: 'practice',
    title: '实践',
    slogan: '社会实践、基层实践、知行合一',
    items: [
      {
        id: 'practice-three-rural',
        name: '三下乡',
        desc: '暑期社会实践、基层调研与志愿服务',
      },
      {
        id: 'practice-return-home',
        name: '返家乡',
        desc: '返乡实践、社区服务与基层治理参与',
      },
      {
        id: 'practice-research',
        name: '实践调研',
        desc: '后续可扩展调研报告、实践成果、活动记录',
      },
    ],
  },
];

const DEFAULT_MENU = MENU_LIST[0];

Page({

  /**
   * 页面的初始数据
   */
  data: {
    activeMenuKey: DEFAULT_MENU.key,
    menuList: MENU_LIST,
    currentMenu: DEFAULT_MENU,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '先锋e站',
      path: '/pages/types/types',
    };
  },
  switchMenu(e) {
    const key = e.currentTarget.dataset.key;
    const nextMenu = MENU_LIST.find((menu) => menu.key === key);

    if (!nextMenu || key === this.data.activeMenuKey) {
      return;
    }

    this.setData({
      activeMenuKey: nextMenu.key,
      currentMenu: nextMenu,
    });
  },

  onItemClick(e) {
    const item = e.currentTarget.dataset.item;

    if (!item) {
      return;
    }

    this.handleNavigate(item);
  },

  onChildItemClick(e) {
    const item = e.currentTarget.dataset.item;

    if (!item) {
      return;
    }

    this.handleNavigate(item);
  },

  handleNavigate(item) {
    if (item.path) {
      wx.navigateTo({
        url: item.path,
      });
      return;
    }

    wx.showToast({
      title: `查看：${item.name}`,
      icon: 'none',
      duration: 1600,
    });
  },
})