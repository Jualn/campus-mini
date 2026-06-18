// components/report-panel/index.ts
import defineComponent from '../../utils/defineComponent';
import createLogger from '../../utils/logger';
import { wxShowToast } from '../../utils/wx-promise';
import { REPORT_REASONS, type TargetType, type ReportReason } from '../../utils/constants';
import { useSheet } from '../../behaviors/sheet-mixin';
import { reportService } from '../../services/index';

interface ReportPanelPrivate {
  _sheetDismiss?: () => void;
}

const log = createLogger('ReportPopup');

interface ReportReasonOption {
  value: ReportReason;
  label: string;
  icon: string;
  hint: string;
}

const REPORT_REASON_OPTIONS: ReportReasonOption[] = [
  {
    value: REPORT_REASONS.ILLEGAL.value,
    label: '违规违法',
    icon: '/images/icons/violation.svg',
    hint: '涉及违法违规、危险行为或不当内容',
  },
  {
    value: REPORT_REASONS.PORNOGRAPHIC.value,
    label: '色情低俗',
    icon: '/images/icons/18.svg',
    hint: '包含色情、低俗、擦边或令人不适内容',
  },
  {
    value: REPORT_REASONS.ADVERTISEMENT.value,
    label: '广告骚扰',
    icon: '/images/icons/ad.svg',
    hint: '包含营销广告、引流、刷屏或骚扰信息',
  },
  {
    value: REPORT_REASONS.FALSE_INFO.value,
    label: '虚假信息',
    icon: '/images/icons/fackmessage.svg',
    hint: '内容不真实，存在误导、造谣或虚假描述',
  },
  {
    value: REPORT_REASONS.OTHER.value,
    label: '其他',
    icon: '/images/icons/others.svg',
    hint: '其他无法归类的问题，可补充说明',
  },
];

defineComponent<ReportPanelPrivate>()({
  behaviors: [useSheet()],
  /**
   * 组件的属性列表
   * ─── 外部属性 ───────────────────────────────────────────────────
   *
   * targetType      Number   举报对象类型，使用项目已有公共枚举
   * targetId        String   举报对象 ID，建议用 String，避免 BIGINT 精度问题
   * reasonOptions   Array    后端返回的举报原因枚举列表
   * submitting      Boolean  父页面提交接口时传入，防止重复点击
   */
  properties: {
    /**
     * 举报对象类型。
     * 使用项目中已有的公共 targetType 枚举，不在举报模块重复定义。
     */
    targetType: {
      type: String,
      value: '',
    },

    /**
     * 举报对象 ID。
     * 建议使用 String，避免 BIGINT 在前端出现精度问题。
     */
    targetId: {
      type: String,
      value: '',
    },

    /**
     * 外部提交状态。
     * 父页面请求接口时传入，防止重复点击。
     */
    submitting: {
      type: Boolean,
      value: false,
      observer() {
        this.updateCanSubmit();
      },
    },

    /**
     * 补充说明最大长度。
     * 与数据库 remark VARCHAR(255) 保持一致。
     */
    remarkMaxLength: {
      type: Number,
      value: 255,
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    panelRatio: 0.68,

    reasonList: REPORT_REASON_OPTIONS,
    selectedReason: '',
    isOtherSelected: false,
    remark: '',
    canSubmit: false,
  },

  /**
   * 组件的方法列表
   */
  methods: {
    noop() {
      /* empty */
    },

    updateCanSubmit() {
      const selectedReason = this.data.selectedReason || '';

      this.setData({
        canSubmit: selectedReason !== '' && !this.properties.submitting,
      });
    },

    // resetForm() {
    //   this.setData({
    //     selectedReason: '',
    //     isOtherSelected: false,
    //     remark: '',
    //     canSubmit: false,
    //   });
    // },

    // onClose() {
    //   this._sheetDismiss?.();
    //   this.triggerEvent('close');

    //   setTimeout(() => {
    //     this.resetForm();
    //   }, 240);
    // },

    onSelectReason(e: WechatMiniprogram.TouchEvent) {
      const value = e.currentTarget.dataset.value as ReportReason | undefined;

      if (value === undefined) {
        return;
      }

      const reason = this.data.reasonList.find((item) => item.value === value);

      this.setData(
        {
          selectedReason: value,
          isOtherSelected: reason?.value === REPORT_REASONS.OTHER.value,
        },
        () => {
          this.updateCanSubmit();
        },
      );
    },

    onRemarkInput(e: WechatMiniprogram.Input) {
      const max = this.properties.remarkMaxLength || 255;
      const value = (e.detail.value || '').slice(0, max);

      this.setData({
        remark: value,
      });
    },

    async onSubmit() {
      const { targetType, targetId, submitting } = this.properties as {
        targetType: TargetType;
        targetId: string;
        submitting: boolean;
      };
      const { selectedReason, remark } = this.data as {
        selectedReason: ReportReason | '';
        remark: string;
      };

      if (submitting) return;

      if (!targetId) {
        log.warn('onSubmit', '举报对象参数异常', {
          targetType,
          targetId,
        });

        void wxShowToast({
          title: '举报对象异常',
          icon: 'none',
        });

        return;
      }

      if (!selectedReason) {
        void wxShowToast({
          title: '请选择举报原因',
          icon: 'none',
        });

        return;
      }

      try {
        await reportService.report({
          targetType,
          targetId,
          reason: selectedReason,
          mark: remark.trim(),
        });

        void wxShowToast({
          title: '举报成功',
          icon: 'success',
        });

        // 评论内举报完成后回到评论区；帖子举报完成后关闭整个弹窗。
        this.triggerEvent('close');
      } catch (err: unknown) {
        log.error('onReportSubmit', '举报失败', err);
        void wxShowToast({
          title: '举报失败，请稍后再试',
          icon: 'none',
        });
      }
    },
  },
});
