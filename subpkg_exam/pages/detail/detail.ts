// subpkg_exam/pages/detail/detail.ts

import { wxSetClipboardData } from '../../../utils/wx-promise';
import { examAction } from '../../../actions/index';
import { createLogger } from '../../../utils/logger';
import type { ExamDetail } from '../../../types/business';
import { drawExamPoster } from '../../utils/examPoster';
import { showErrorToast, showSuccessToast } from '../../../utils/notify';
import { useAsyncLoad } from '../../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { navigateBackOrHome } from '../../../utils/navigation';

const log = createLogger('ExamDetailPage');

definePage({
  behaviors: [useAsyncLoad()],

  data: {
    statusBarHeight: 20,
    examId: '',
    exam: {} as ExamDetail,
    skeletonSections: [1, 2, 3],

    // currentShareImage: '',
    // currentSharePath: '',
  },

  onLoad(query: { examId: string; from?: string }) {
    const sys = wx.getWindowInfo();
    this.setData({
      statusBarHeight: sys.statusBarHeight,
      examId: query.examId || '',
    });

    void this._loadExam(query.examId);
  },

  async _loadExam(examId: string, options: { preserveError?: boolean } = {}) {
    if (!examId) {
      this._asyncLoadFail('考试信息不存在');
      return;
    }

    this._asyncLoadBegin(options);
    try {
      const detail = await examAction.getExamDetail(examId);
      this.setData({
        exam: detail,
      });
      this._asyncLoadSuccess();
    } catch (err) {
      this._asyncLoadFail('网络可能暂时不可用，请稍后再试');
      log.error('onLoad', `加载考试详情失败 [${examId}]`, err);
    }
  },

  onRetryLoad() {
    void this._loadExam(this.data.examId, { preserveError: true });
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
    navigateBackOrHome();
  },
});
