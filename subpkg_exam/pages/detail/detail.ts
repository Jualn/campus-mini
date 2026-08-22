// subpkg_exam/pages/detail/detail.ts

import { wxNavigateBack, wxSetClipboardData } from '../../../utils/wx-promise';
import { examAction } from '../../../actions/index';
import { createLogger } from '../../../utils/logger';
import type { ExamDetail } from '../../../types/business';
import { drawExamPoster } from '../../utils/examPoster';
import { showErrorToast, showSuccessToast } from '../../../utils/notify';

const log = createLogger('ExamDetailPage');

Page({
  data: {
    statusBarHeight: 20,
    exam: {} as ExamDetail,

    // currentShareImage: '',
    // currentSharePath: '',
  },

  async onLoad(query: { examId: string; from?: string }) {
    const sys = wx.getWindowInfo();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
    });

    const examId = query.examId;
    if (!examId) {
      return;
    }
    try {
      const detail = await examAction.getExamDetail(examId);
      this.setData({
        exam: detail,
      });
    } catch (err) {
      log.error('onLoad', `加载考试详情失败 [${examId}]`, err);
      showErrorToast(err, { fallback: '加载考试详情失败' });
    }
  },

  // onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
  //   const { id } = this.data.exam;
  //   const currentShareImage = this.data.currentShareImage;
  //   return {
  //     // title: content.slice(0, 30) || '校园圈动态',
  //     path: `/subpkg_exam/pages/detail/detail?examId=${id}&from=share`,
  //     imageUrl: currentShareImage || '',
  //   };
  // },

  // onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
  //   const { id } = this.data.exam;
  //   const currentShareImage = this.data.currentShareImage;
  //   return {
  //     // title: content.slice(0, 30) || '校园圈动态',
  //     query: `examId=${id}&from=share`,
  //     imageUrl: currentShareImage || '',
  //   };
  // },

  // onShare() {},

  async _drawExamPoster() {
    const exam = this.data.exam;
    const timeline = exam.timeline;
    let enrollTime: string;
    let examTime: string;

    if (timeline !== undefined) {
      enrollTime = timeline.find((item) => item.label === 'enroll')?.date ?? '';
      examTime = timeline.find((item) => item.label === 'exam')?.date ?? '';
    } else {
      enrollTime = '';
      examTime = '';
    }

    const posterData = {
      name: exam.name,
      enrollTime,
      examTime,
      desc: exam.desc ? exam.desc.slice(0, 20) : '',
    };

    await drawExamPoster(this, posterData, (tempFilePath) => {
      this.setData({
        currentShareImage: tempFilePath,
      });
    });
  },

  onOpenLink(e: WechatMiniprogram.TouchEvent) {
    const { url } = e.currentTarget.dataset as { url: string };

    if (typeof url !== 'string' || !url.trim()) return;

    void wxSetClipboardData({ data: url })
      .then(() => {
        showSuccessToast('链接已复制');
      })
      .catch((err: unknown) => {
        showErrorToast(err, { fallback: '复制失败' });
      });
  },

  onBack() {
    void wxNavigateBack();
  },
});
