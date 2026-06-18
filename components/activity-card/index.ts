// components/activity-card/index.ts
/**
 * activity-card 组件
 *
 * 用法：
 *   <activity-card activity="{{item}}" />
 *
 * Properties:
 *   activity  Object  活动数据
 *     - id, title, cover, type, scope
 *     - status, statusLabel, typeColor, typeIcon
 *     - enroll_deadline, daysToDeadline
 *     - location, max_participants
 *     - organizer, published_at, summary
 *
 * Events:
 *   tap  → 点击卡片时触发，{ activityId }
 *
 * 说明：
 *   组件默认会跳转到活动详情页。
 *   父页面如果只需要展示，不需要额外处理 tap 事件。
 */

import defineComponent from '../../utils/defineComponent';
import type { ActivityCard } from '../../types/business';
import createLogger from '../../utils/logger';
import { wxNavigateTo } from '../../utils/wx-promise';

const log = createLogger('ActivityCard');

interface ActivityCardPrivate {
  _scopeList: string[];
  _statusClass: string;
  _typeColorClass: string;
  _deadlineText: string;
  _isDeadlineUrgent: boolean;
}

function normalizeStatusClass(status?: string) {
  if (!status) return 'unknown';

  const map: Record<string, string> = {
    enrolling: 'enrolling',
    not_started: 'upcoming',
    upcoming: 'upcoming',
    ongoing: 'ongoing',
    ended: 'ended',
    cancelled: 'cancelled',
    preview: 'preview',
  };

  return map[status] || 'unknown';
}

defineComponent<ActivityCardPrivate>()({
  /**
   * 组件的属性列表
   */
  properties: {
    activity: {
      type: Object as unknown as null,
      value: {} as ActivityCard,
      observer(newVal: ActivityCard | null) {
        if (!newVal) return;

        const daysToDeadline =
          typeof newVal.daysToDeadline === 'number' ? newVal.daysToDeadline : null;

        this.setData({
          _scopeList: newVal.scope,
          _statusClass: normalizeStatusClass(newVal.status),
          _typeColorClass: newVal.typeColor || 'default',
          _deadlineText: this._formatDeadline(newVal.enroll_deadline, daysToDeadline),
          _isDeadlineUrgent: daysToDeadline !== null && daysToDeadline >= 0 && daysToDeadline <= 3,
        });
      },
    },
  },

  /**
   * 组件的初始数据
   */
  data: {
    _scopeList: [] as string[],
    _statusClass: 'unknown',
    _typeColorClass: 'default',
    _deadlineText: '',
    _isDeadlineUrgent: false,
  },

  lifetimes: {
    attached() {
      // 私有字段初始化
      this._scopeList = [];
      this._statusClass = 'unknown';
      this._typeColorClass = 'default';
      this._deadlineText = '';
      this._isDeadlineUrgent = false;
    },

    detached() {
      // 私有字段重置（以防万一，虽然下次 attached 会重新赋值）
      this._scopeList = [];
      this._statusClass = 'unknown';
      this._typeColorClass = 'default';
      this._deadlineText = '';
      this._isDeadlineUrgent = false;
    },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 空方法占位。
     * 用于需要 catchtap 阻止冒泡但暂无具体逻辑的场景。
     */
    noop() {
      /* empty */
    },

    /**
     * 格式化报名截止时间。
     * 临近截止时优先展示“还剩 x 天”，否则展示原始截止时间。
     */
    _formatDeadline(deadline?: string, daysToDeadline?: number | null) {
      if (!deadline) return '';
      if (typeof daysToDeadline === 'number' && daysToDeadline >= 0 && daysToDeadline <= 3) {
        return `报名截止 还剩${String(daysToDeadline)}天`;
      }
      return `报名截止 ${deadline}`;
    },

    /**
     * 点击活动卡片。
     * 1. 对外触发 tap，方便父页面埋点或自定义处理。
     * 2. 默认跳转到活动详情页，和原活动列表页 goDetail 行为一致。
     */
    onTapCard() {
      const { id } = this.properties.activity;
      if (!id) return;

      this.triggerEvent('tap', {
        activityId: id,
      });

      void wxNavigateTo({
        url: `/subpkg_activity/pages/detail/detail?activityId=${id}`,
      }).catch((err: unknown) => {
        log.error('onTapCard', '跳转活动详情失败', err);
      });
    },
  },
});
