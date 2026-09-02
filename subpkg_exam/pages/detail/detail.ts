import { useSharePoster } from '../../../behaviors/useSharePoster';
// subpkg_exam/pages/detail/detail.ts

import { wxSetClipboardData } from '../../../utils/wx-promise';
import * as examAction from '../../../actions/exam';
import { createLogger } from '../../../utils/logger';
import type { ExamDetail } from '../../../types/business';
import { drawExamPoster } from '../../utils/examPoster';
import { showErrorToast, showSuccessToast } from '../../../utils/notify';
import { useAsyncLoad } from '../../behaviors/useAsyncLoad';
import definePage from '../../../utils/definePage';
import { navigateBackOrHome } from '../../utils/navigation';

const log = createLogger('ExamDetailPage');

definePage({
  behaviors: [useAsyncLoad(), useSharePoster()],

  data: {
    statusBarHeight: 20,
    examId: '',
    exam: {} as ExamDetail,
    skeletonSections: [1, 2, 3],

    showPopup: false,
    popupType: '',
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
      this._prepareExamShare();
    } catch (err) {
      this._asyncLoadFail('网络可能暂时不可用，请稍后再试');
      log.error('onLoad', `加载考试详情失败 [${examId}]`, err);
    }
  },

  onRetryLoad() {
    void this._loadExam(this.data.examId, { preserveError: true });
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return this._getShareContent();
  },

  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent {
    return {
      query: `examId=${this.data.exam.id}&from=share`,
      imageUrl: this._getShareContent().imageUrl,
    };
  },

  onShareOpen() {
    if (!this.data.exam.id) return;
    this._prepareExamShare();
    this.setData({ showPopup: true, popupType: 'share' });
  },
  onShareClose() {
    this.setData({ showPopup: false });
  },
  onOverlayTap() {
    this.onShareClose();
  },
  onPopupAfterLeave() {
    this.setData({ showPopup: false, popupType: '' });
  },
  noop() {
    /* block overlay touch */
  },

  _prepareExamShare() {
    const exam = this.data.exam;
    if (!exam.id) return;
    const posterData = {
      name: exam.name,
      desc: (exam.desc ?? '') || exam.tagline || '',
      dates: (exam.timeline ?? [])
        .filter((item) => item.date)
        .slice(0, 2)
        .map((item) => ({
          label: item.label,
          value: [item.date, item.time].filter(Boolean).join(' '),
        })),
    };
    this._prepareShare({
      key: JSON.stringify([exam.id, posterData]),
      path: `/subpkg_exam/pages/detail/detail?examId=${exam.id}&from=share`,
      render: (scope) => drawExamPoster(scope, posterData),
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
