// exam.ts
/**
 * 考试服务 (Exam Service)
 *
 * 📌 当前状态：使用静态数据（EXAM_DB）
 * 📌 后续切换：恢复下面注释的 API 调用即可
 *
 * 对齐 OpenAPI：
 * - GET    /v1/exam          → getExamSimpleList
 * - GET    /v1/exam/list     → getExamList
 * - GET    /v1/exam/{id}     → getExamDetail
 * - GET    /v1/exam/{id}/timeline → getExamTimeline
 */

import api from './api'; // 接口保留，当前未使用
import createLogger from '../utils/logger';
import {
  EXAM_DB,
  getExamDetail as getExamDetailFromDB,
  getExamTimeline as getExamTimelineFromDB,
} from '../utils/exam-db';
import type {
  ExamDetail,
  ExamListItem,
  ExamListPagePayload,
  ExamSearchItem,
  ExamTimelineItem,
  HotExam,
  IndexExamCardItem,
} from '../types/business';

const log = createLogger('ExamService');

void api;
void log;

/**
 * 首页 / banner 支持的颜色。
 * 如果静态数据里 color 写错，统一兜底为 blue。
 */
const VALID_EXAM_COLORS = new Set([
  'blue',
  'orange',
  'purple',
  'green',
  'red',
  'indigo',
  'gold',
  'yellow',
  'amber',
  'slate',
  'cyan',
]);

function normalizeColor(color?: string): string {
  if (!color) return 'blue';
  return VALID_EXAM_COLORS.has(color) ? color : 'blue';
}

/**
 * 手动解析日期，避免 new Date('2026-09-05') 在不同环境出现时区偏差。
 * 支持：
 * - 2026-09-05
 * - 2026-09-05 09:00
 * - 2026-09-05T09:00
 * - 2026-09-05 09:00:00
 */
function parseExamDate(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);

  if (match) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );

    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  const fallback = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(fallback.getTime())) return null;
  return fallback;
}

function joinDateTime(date = '', time = ''): string {
  if (!date) return '';
  return time ? `${date} ${time}` : date;
}

function parseDateTimeWithBoundary(value: string, boundary: 'start' | 'end'): Date | null {
  const text = value.trim();
  if (!text) return null;

  const hasTime = /\d{2}:\d{2}/.test(text);

  if (hasTime) {
    return parseExamDate(text);
  }

  /**
   * 没有明确时间时：
   * - 开始日期按当天 00:00:00
   * - 截止日期按当天 23:59:59
   *
   * 这样避免“报名截止日当天凌晨就被判定为 closed”。
   */
  return parseExamDate(`${text} ${boundary === 'end' ? '23:59:59' : '00:00:00'}`);
}

function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isFutureDate(dateStr: string): boolean {
  const parsed = parseExamDate(dateStr);
  if (!parsed) return false;

  const today = getTodayStart();
  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);

  return target.getTime() > today.getTime();
}

function calcDaysLeft(dateStr: string): number {
  const parsed = parseExamDate(dateStr);
  if (!parsed) return 0;

  const target = new Date(parsed);
  target.setHours(0, 0, 0, 0);

  const today = getTodayStart();
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  return diff > 0 ? diff : 0;
}

function calcEnrollStatus(start: string, end: string): string {
  if (!start || !end) return 'unknown';

  const startDate = parseDateTimeWithBoundary(start, 'start');
  const endDate = parseDateTimeWithBoundary(end, 'end');

  if (!startDate || !endDate) return 'unknown';

  const now = new Date();

  if (now >= startDate && now <= endDate) return 'open';
  if (now < startDate) return 'upcoming';

  return 'closed';
}

function calcSortDistance(dateStr: string): number {
  const date = parseExamDate(dateStr);
  if (!date) return Number.POSITIVE_INFINITY;

  const today = getTodayStart();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = target.getTime() - today.getTime();

  /**
   * 已过期日期不参与靠前排序。
   * 否则“昨天考试”的项目会比“三个月后考试”的项目更靠前。
   */
  if (diff <= 0) return Number.POSITIVE_INFINITY;

  return diff;
}

/**
 * 判断某个 timeline 项是不是“真正的考试日期”。
 * 不再用 timeline 最后一项，因为最后一项很多是成绩查询。
 */
function isExamEvent(item: ExamTimelineItem): boolean {
  if (!item.date) return false;

  const label = item.label || '';

  const includeKeywords = [
    '笔试',
    '初试',
    '上机考试',
    '客观题考试',
    '主观题考试',
    '专业阶段考试',
    '综合阶段考试',
    '考试',
    '测试',
  ];

  const excludeKeywords = [
    '报名',
    '缴费',
    '交费',
    '准考证',
    '成绩',
    '查询',
    '公布',
    '截止',
    '确认',
    '面试',
    '口试',
    '口语',
    '复试',
    '认定',
  ];

  return (
    includeKeywords.some((keyword) => label.includes(keyword)) &&
    !excludeKeywords.some((keyword) => label.includes(keyword))
  );
}

/**
 * 找到当前最适合展示的考试日期：
 * 1. 只找真正考试事件
 * 2. 只返回未来日期
 * 3. 多个未来日期时，返回最近一个
 * 4. 如果都过期或没有准确日期，返回空，避免展示 0 天
 */
function findExamDate(timeline: ExamTimelineItem[]): string {
  const candidates = timeline
    .filter(isExamEvent)
    .map((item) => ({
      item,
      date: parseExamDate(item.date),
    }))
    .filter((candidate): candidate is { item: ExamTimelineItem; date: Date } => {
      if (!candidate.date) return false;
      return isFutureDate(candidate.item.date);
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return candidates[0]?.item.date ?? '';
}

/**
 * 找报名区间。
 * 尽量找成对的“报名开始 / 报名截止”。
 * 如果有多组报名，例如法考客观题、主观题报名：
 * - 优先返回正在进行中的报名
 * - 其次返回未来最近的报名
 * - 最后返回最近一组历史报名
 */
function findEnrollDates(timeline: ExamTimelineItem[]): { start: string; end: string } {
  const periods: {
    start: string;
    end: string;
    startDate: Date | null;
    endDate: Date | null;
  }[] = [];

  timeline.forEach((item, index) => {
    const label = item.label || '';

    const isStart =
      label.includes('报名') &&
      !label.includes('截止') &&
      !label.includes('确认') &&
      !label.includes('面试');

    if (!isStart || !item.date) return;

    const start = joinDateTime(item.date, item.time);

    const endItem =
      timeline.slice(index + 1).find((t) => {
        const endLabel = t.label || '';
        return endLabel.includes('报名') && endLabel.includes('截止') && !!t.date;
      }) ??
      timeline.slice(index + 1).find((t) => {
        const endLabel = t.label || '';
        return (
          endLabel.includes('截止') &&
          !endLabel.includes('缴费') &&
          !endLabel.includes('交费') &&
          !endLabel.includes('信息采集') &&
          !!t.date
        );
      });

    const end = joinDateTime(endItem?.date ?? '', endItem?.time ?? '');

    if (!end) return;

    periods.push({
      start,
      end,
      startDate: parseDateTimeWithBoundary(start, 'start'),
      endDate: parseDateTimeWithBoundary(end, 'end'),
    });
  });

  if (!periods.length) {
    return { start: '', end: '' };
  }

  const now = new Date();

  const open = periods.find(
    (period) =>
      period.startDate && period.endDate && now >= period.startDate && now <= period.endDate,
  );

  if (open) {
    return {
      start: open.start,
      end: open.end,
    };
  }

  const upcoming = periods
    .filter((period) => period.startDate && now < period.startDate)
    .sort((a, b) => {
      if (!a.startDate || !b.startDate) return 0;
      return a.startDate.getTime() - b.startDate.getTime();
    });

  if (upcoming.length) {
    return {
      start: upcoming[0].start,
      end: upcoming[0].end,
    };
  }

  const latestPast = periods
    .filter((period) => period.endDate)
    .sort((a, b) => {
      if (!a.endDate || !b.endDate) return 0;
      return b.endDate.getTime() - a.endDate.getTime();
    })[0];

  return {
    start: latestPast.start,
    end: latestPast.end,
  };
}

function mapExamCard(exam: ExamDetail | undefined) {
  if (exam === undefined) {
    throw new Error('Exam not found');
  }

  const date = findExamDate(exam.timeline ?? []);

  return {
    id: exam.id,
    name: exam.name,
    icon: exam.icon,
    color: normalizeColor(exam.color),
    tagline: exam.tagline || '',
    frequency: exam.frequency ?? '',
    timeline: exam.timeline ?? [],
    links: exam.links ?? [],
    date,
    days: calcDaysLeft(date),
    sortDistance: calcSortDistance(date),
  };
}

function buildExamCards(includeWithoutDate = true) {
  return Object.values(EXAM_DB)
    .map(mapExamCard)
    .filter((exam) => includeWithoutDate || !!exam.date)
    .sort((a, b) => {
      if (a.sortDistance !== b.sortDistance) {
        return a.sortDistance - b.sortDistance;
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
}

function buildAllExams(includeWithoutDate = false) {
  return buildExamCards(includeWithoutDate).map(({ ...exam }) => exam);
}

const EXAM_CATEGORY_MAP: Record<string, string> = {
  cet4: 'language',
  cet6: 'language',
  putonghua: 'language',

  ncre: 'computer',
  ruankao: 'computer',

  teacher: 'certificate',
  guokao: 'certificate',
  cpa: 'certificate',
  juniorAccounting: 'certificate',
  intermediateAccounting: 'certificate',
  lawExam: 'certificate',

  kaoyan: 'graduate',
};

const EMPTY_HOT_EXAM: HotExam = {
  id: '',
  name: '',
  tagline: '',
  daysLeft: 0,
};

function mapExamListItem(item: ExamDetail): ExamListItem {
  const timeline = item.timeline ?? [];
  const { start, end } = findEnrollDates(timeline);

  /**
   * 关键修复：
   * 列表页不能使用 timeline[timeline.length - 1]?.date。
   * 因为最后一项经常是“成绩查询”，很多时候没有日期。
   */
  const examDate = findExamDate(timeline);

  return {
    id: item.id,
    name: item.name || '',
    tagline: item.tagline || '',
    icon: item.icon ?? '',
    color: normalizeColor(item.color),
    frequency: item.frequency ?? '',
    examDate,
    daysLeft: calcDaysLeft(examDate),
    enrollStatus: calcEnrollStatus(start, end),
    category: EXAM_CATEGORY_MAP[item.id] || 'all',
    currentTerm: {
      enrollStart: start,
      enrollEnd: end,
      examDate,
    },
  };
}

function buildExamListItems(items: ExamDetail[]): ExamListItem[] {
  return items.map(mapExamListItem);
}

function pickHotExam(items: ExamListItem[]): HotExam {
  if (!items.length) return EMPTY_HOT_EXAM;

  const upcoming = items
    .filter((item) => item.examDate && item.daysLeft > 0)
    .sort((a, b) => {
      if (a.daysLeft !== b.daysLeft) {
        return a.daysLeft - b.daysLeft;
      }
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });

  /**
   * 没有未来准确考试日期时，不展示 hotExam。
   * 避免 banner 出现“最近开考”但倒计时为 0 或空。
   */
  if (!upcoming.length) return EMPTY_HOT_EXAM;

  const best = upcoming[0];

  return {
    id: best.id,
    name: best.name,
    tagline: best.tagline,
    icon: best.icon,
    color: normalizeColor(best.color),
    examDate: best.examDate,
    daysLeft: best.daysLeft,
    enrollStatus: best.enrollStatus,
  };
}

export const getExamListPageData = (): ExamListPagePayload => {
  /**
   * list 页需要展示全部考试：
   * - 有未来准确日期的，展示倒计时
   * - 没有未来准确日期的，页面展示“日期待官方公告”
   */
  const exams = buildExamCards(true);
  const allExams = buildExamListItems(exams);

  return {
    allExams,
    hotExam: pickHotExam(allExams),
  };
};

export const refreshExamListPageData = (items: ExamListItem[]): ExamListPagePayload => {
  const allExams = items.map((exam) => {
    const examDate = exam.examDate ?? exam.currentTerm?.examDate ?? '';
    const enrollStart = exam.currentTerm?.enrollStart ?? '';
    const enrollEnd = exam.currentTerm?.enrollEnd ?? '';

    return {
      ...exam,
      color: normalizeColor(exam.color),
      examDate,
      daysLeft: calcDaysLeft(examDate),
      enrollStatus: calcEnrollStatus(enrollStart, enrollEnd),
    };
  });

  return {
    allExams,
    hotExam: pickHotExam(allExams),
  };
};

export const filterExamListByCategory = (
  items: ExamListItem[],
  category: string,
): ExamListItem[] => {
  if (!items.length) return [];
  if (!category || category === 'all') return items;
  return items.filter((item) => item.category === category);
};

export const searchExamList = (items: ExamListItem[], keyword: string): ExamSearchItem[] => {
  const kw = keyword.trim();
  if (!kw) return [];

  return items
    .filter((exam) => exam.name.includes(kw) || exam.tagline.includes(kw))
    .map((exam) => ({
      id: exam.id,
      color: normalizeColor(exam.color),
      icon: exam.icon,
      name: exam.name,
      tagline: exam.tagline,
    }));
};

/**
 * 获取考试精简列表（用于首页展示）
 *
 * 📌 当前：从 EXAM_DB 静态获取
 * 📌 后续：恢复下面注释代码即可使用 API
 */
export const getExamSimpleList = (): IndexExamCardItem[] => {
  // ============ 当前实现：静态数据 ============

  /**
   * 首页 card 只展示有“未来准确考试日期”的项目。
   * 这样不会出现：
   * - 日期为空
   * - days = 0
   * - 已过期考试仍展示在首页
   */
  const exams = buildAllExams(false).filter((exam) => exam.date && exam.days > 0);

  return exams.map((exam) => ({
    id: exam.id,
    name: exam.name,
    icon: exam.icon,
    color: normalizeColor(exam.color),
    date: exam.date,
    days: exam.days,
  })) as IndexExamCardItem[];

  // ============ 后续API实现：取消下面注释 ============
  // return await api.exam.getSimpleList();
};

/**
 * 获取所有考试的时间表
 *
 * 📌 当前：从 EXAM_DB 静态获取
 * 📌 后续：恢复下面注释代码即可使用 API
 */
export const getExamTimelines = (): Record<string, ExamTimelineItem[]> => {
  // ============ 当前实现：静态数据 ============
  const timelines: Record<string, ExamTimelineItem[]> = {};
  Object.keys(EXAM_DB).forEach((examId) => {
    timelines[examId] = getExamTimelineFromDB(examId);
  });
  return timelines;

  // ============ 后续API实现：取消下面注释 ============
  // const pageResult = await api.exam.getList({});
  // const list = pageResult?.list || [];
  // const timelines: Record<string, ExamTimelineItem[]> = {};
  // list.forEach((item) => {
  //   timelines[String(item.id)] = (item.timelineItems as unknown[]) || [];
  // });
  // return timelines;
};

/**
 * 获取单个考试的时间表
 *
 * 📌 当前：从 EXAM_DB 静态获取
 * 📌 后续：恢复下面注释代码即可使用 API
 */
export const getExamTimeline = async (examId: string): Promise<ExamTimelineItem[]> => {
  if (!examId) {
    return Promise.reject(new Error('examId不能为空'));
  }

  // ============ 当前实现：静态数据 ============
  return getExamTimelineFromDB(examId);

  // ============ 后续API实现：取消下面注释 ============
  // return api.exam.getTimeline(examId);
};

export const getExamDetail = async (examId: string): Promise<ExamDetail> => {
  if (!examId) {
    return Promise.reject(new Error('examId不能为空'));
  }

  // ============ 当前实现：静态数据 ============
  const detail = getExamDetailFromDB(examId);

  // ============ 后续API实现：取消下面注释 ============
  // const detail = await api.exam.getDetail(examId);
  // data: mapExamDetail(detail);

  if (!detail) {
    return Promise.reject(new Error(`考试不存在 [${examId}]`));
  }

  return {
    ...detail,
    color: normalizeColor(detail.color),
  };
};

export default {
  getExamSimpleList,
  getExamTimelines,
  getExamTimeline,
  getExamListPageData,
  refreshExamListPageData,
  filterExamListByCategory,
  searchExamList,
  getExamDetail,
};
