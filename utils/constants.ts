/**
 * 共用常量和工具函数
 * 包含跨页面使用的常量、枚举和辅助函数
 */

// ─── 状态标签 ──────────────────────────────────────────────
/** 活动状态枚举 */

export const ACTIVITY_STATUS = {
  DRAFT: { value: 'DRAFT', text: '草稿' },
  PENDING: { value: 'PENDING', text: '待审核' },
  SIGNUP: { value: 'SIGNUP', text: '报名中' },
  ONGOING: { value: 'ONGOING', text: '进行中' },
  ENDED: { value: 'ENDED', text: '已结束' },
  CANCELED: { value: 'CANCELED', text: '已取消' },
  REJECTED: { value: 'REJECTED', text: '已驳回' },
  DELETED: { value: 'DELETED', text: '已删除' },
} as const;

export type ActivityStatus = keyof typeof ACTIVITY_STATUS;

export const ACTIVITY_CATEGORYS = {
  OTHER: { value: 'OTHER', text: '其他' },
  TALENT_SHOW: { value: 'TALENT_SHOW', text: '文体比赛' },
  VOLUNTEER_SERVICE: { value: 'VOLUNTEER_SERVICE', text: '志愿公益' },
  POLITICAL_THEME: { value: 'POLITICAL_THEME', text: '思政主题' },
  ACADEMIC_SEMINAR: { value: 'ACADEMIC_SEMINAR', text: '学术讲座' },
  SPORTS_EVENT: { value: 'SPORTS_EVENT', text: '体育运动' },
} as const;

export type ActivityCategory = keyof typeof ACTIVITY_CATEGORYS;

export const REPORT_REASONS = {
  ILLEGAL: { value: 'ILLEGAL', text: '违规违法' },
  PORNOGRAPHIC: { value: 'PORNOGRAPHIC', text: '色情低俗' },
  ADVERTISEMENT: { value: 'ADVERTISEMENT', text: '广告骚扰' },
  FALSE_INFO: { value: 'FALSE_INFO', text: '虚假信息' },
  OTHER: { value: 'OTHER', text: '其他' },
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export const TARGET_TYPES = {
  POST: { value: 'POST', code: 1, text: '帖子' },
  ACTIVITY: { value: 'ACTIVITY', code: 2, text: '活动' },
  EXAM: { value: 'EXAM', code: 3, text: '考试' },
  COMMENT: { value: 'COMMENT', code: 4, text: '评论' },
  USER: { value: 'USER', code: 5, text: '用户' },
} as const;

export type TargetType = keyof typeof TARGET_TYPES;

export const MEDIA_TYPES = {
  URL: { value: 'URL', code: 1, text: '链接' },
  IMAGE: { value: 'IMAGE', code: 2, text: '图片' },
  PDF: { value: 'PDF', code: 3, text: 'PDF文档' },
  WORD: { value: 'WORD', code: 4, text: 'Word文档' },
} as const;

export type MediaType = keyof typeof MEDIA_TYPES;

export const NOTIFY_TYPES = {
  COMMENTED_ME: { value: 'COMMENTED_ME', code: 1, text: '评论了我' },
  REPLIED_ME: { value: 'REPLIED_ME', code: 2, text: '回复了我' },
  LIKED_ME: { value: 'LIKED_ME', code: 3, text: '点赞了我' },
  ACTIVITY_REMIND: { value: 'ACTIVITY_REMIND', code: 4, text: '活动提醒' },
  EXAM_REMIND: { value: 'EXAM_REMIND', code: 5, text: '考试提醒' },
  AUDIT_RESULT: { value: 'AUDIT_RESULT', code: 6, text: '审核结果' },
  SYSTEM: { value: 'SYSTEM', code: 7, text: '系统通知' },
} as const;

export type NotifyType = keyof typeof NOTIFY_TYPES;

export const USER_PROFILE_TAB = {
  posts: 'posts',
  likes: 'likes',
} as const;

export const ACTIVITY_STATUS_ORDER: Record<string, number> = {
  not_started: 0,
  enrolling: 1,
  ongoing: 2,
  ended: 3,
  cancelled: 4,
  unknown: 5,
};

export const DepartmentBit = {
  ALL: 1,
  INFO: 2,
  SCI_TECH: 4,
  FINANCE: 8,
  HUMANITIES: 16,
  BASIC: 32,
} as const;

export type DepartmentBit = (typeof DepartmentBit)[keyof typeof DepartmentBit];

export const DepartmentText: Record<DepartmentBit, string> = {
  [DepartmentBit.ALL]: '全院',
  [DepartmentBit.INFO]: '信息学科部',
  [DepartmentBit.SCI_TECH]: '理工学科部',
  [DepartmentBit.FINANCE]: '财经学科部',
  [DepartmentBit.HUMANITIES]: '人文学科部',
  [DepartmentBit.BASIC]: '基础学科部',
};

const OPTIONS: DepartmentBit[] = [
  DepartmentBit.ALL,
  DepartmentBit.INFO,
  DepartmentBit.SCI_TECH,
  DepartmentBit.FINANCE,
  DepartmentBit.HUMANITIES,
  DepartmentBit.BASIC,
];

// ─── 活动类型映射 ──────────────────────────────────────────
export const ACTIVITY_TYPE_MAP: Record<string, { color: string; icon: string }> = {
  志愿: { color: 'volunteer', icon: '🤝' },
  竞赛: { color: 'competition', icon: '🏆' },
  讲座: { color: 'lecture', icon: '🎤' },
  论坛: { color: 'lecture', icon: '🎤' },
  打卡: { color: 'checkin', icon: '✅' },
  校园: { color: 'campus', icon: '🎉' },
  招聘: { color: 'recruit', icon: '💼' },
  实习: { color: 'recruit', icon: '💼' },
  宣传: { color: 'campus', icon: '📢' },
  评优: { color: 'competition', icon: '⭐' },
};

/**
 * 将选择的部门列表编码为位掩码
 * @example
 * const bit = encodeDepartment(selectedList)
 * { "department": 6 }
 * @param selected 选择的部门列表，使用 DepartmentBit 枚举值
 * @returns 一个数字，表示选择的部门的位掩码
 */
export function encodeDepartment(selected: DepartmentBit[]): number {
  if (selected.includes(DepartmentBit.ALL)) {
    return 63;
  }

  return selected.reduce((sum, v) => sum | v, 0);
}

/**
 * 将部门位掩码解码为部门列表
 * @example
 * const list = decodeDepartment(6)
 * [2, 4] // 表示选择了信息学科部和理工学科部
 * @param value 部门位掩码，一个数字，表示选择的部门的位掩码
 * @returns 一个部门列表，包含 DepartmentBit 枚举值
 */
export function decodeDepartment(value: number): DepartmentBit[] {
  if (value === 63 || value === DepartmentBit.ALL) {
    return [DepartmentBit.ALL];
  }

  return OPTIONS.filter((v) => (value & v) === v);
}

/**
 * 将部门位掩码解码为部门文本列表
 * @example
 * const texts = formatDepartmentText(6)
 * ['信息学科部', '理工学科部']
 * @param value 部门位掩码，一个数字，表示选择的部门的位掩码
 * @returns 一个部门文本列表，包含部门名称字符串
 */
export function formatDepartmentText(value: number): string[] {
  return decodeDepartment(value).map((v) => DepartmentText[v]);
}

// ─── 搜索和高亮 ────────────────────────────────────────────

/**
 * 规范化文本用于搜索
 * @param value 原始值
 * @returns 小写、去空格的字符串
 */
export function normalizeText(value: unknown): string {
  return String(value).trim().toLowerCase();
}

/**
 * 按关键词分割文本并标记高亮
 * @param text 原始文本
 * @param keyword 关键词
 * @returns 高亮分段数组
 */
export function splitHighlight(
  text: string,
  keyword: string,
): { text: string; highlight: boolean }[] {
  if (!text || !keyword) {
    return [{ text: text || '', highlight: false }];
  }

  const kw = keyword.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let remaining = text;
  let lowerRemaining = text.toLowerCase();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const idx = lowerRemaining.indexOf(kw);
    if (idx === -1) {
      if (remaining)
        parts.push({
          text: remaining,
          highlight: false,
        });
      break;
    }
    if (idx > 0)
      parts.push({
        text: remaining.slice(0, idx),
        highlight: false,
      });
    parts.push({
      text: remaining.slice(idx, idx + kw.length),
      highlight: true,
    });
    remaining = remaining.slice(idx + kw.length);
    lowerRemaining = lowerRemaining.slice(idx + kw.length);
  }

  return parts.length
    ? parts
    : [
        {
          text,
          highlight: false,
        },
      ];
}

/**
 * 检查字符串是否匹配多个关键词
 * @param text 文本
 * @param keywords 关键词数组
 * @returns 匹配的关键词列表
 */
export function findMatchedKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
}
