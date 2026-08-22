import { examService } from '../services/index';
import type { ExamListItem } from '../types/business';

export const getExamListPageData = () => examService.getExamListPageData();

export const refreshExamListPageData = (items: ExamListItem[]) =>
  examService.refreshExamListPageData(items);

export const filterExamListByCategory = (items: ExamListItem[], category: string) =>
  examService.filterExamListByCategory(items, category);

export const searchExamList = (items: ExamListItem[], keyword: string) =>
  examService.searchExamList(items, keyword);

export const getExamSimpleList = () => examService.getExamSimpleList();

export const getExamTimelines = () => examService.getExamTimelines();

export const getExamTimeline = (examId: string) => examService.getExamTimeline(examId);

export const getExamDetail = (examId: string) => examService.getExamDetail(examId);
