// behaviors/useListLoad.ts
import defineBehavior from '../utils/defineBehavior';

type ListLoadPhase = 'idle' | 'initial' | 'refresh' | 'more';

interface ListLoadState {
  /** 当前加载阶段 */
  phase: ListLoadPhase;

  /** 是否显示首屏骨架 */
  skeletonVisible: boolean;

  /** 首屏失败 */
  initialError: boolean;

  /** 下拉刷新中 */
  refreshing: boolean;

  /** 分页加载中 */
  loadingMore: boolean;

  /** 分页失败 */
  loadMoreError: boolean;

  /** 是否还有更多 */
  hasMore: boolean;
}

interface ListLoadPrivate {
  _listLoadSkeletonShowTimer: number | null;
  _listLoadSkeletonHideTimer: number | null;
  _listLoadSkeletonShownAt: number;
}

export interface UseListLoadOptions {
  /** 骨架延迟出现，避免接口极快返回时闪一下 */
  skeletonDelay?: number;

  /** 骨架一旦出现后的最短展示时长 */
  minSkeletonDuration?: number;

  /** 默认是否还有更多 */
  defaultHasMore?: boolean;
}

/**
 * 列表加载状态管理，包含首屏加载、下拉刷新、分页加载等常见状态和流程控制
 * 以及骨架屏的显示控制逻辑
 *
 * @param options 配置项
 * @returns 行为对象，提供一系列以 _listLoad 开头的方法供组件调用
 */
export function useListLoad(options: UseListLoadOptions = {}) {
  const { skeletonDelay = 150, minSkeletonDuration = 300, defaultHasMore = true } = options;

  const defaultState: ListLoadState = {
    phase: 'initial',
    skeletonVisible: false,
    initialError: false,
    refreshing: false,
    loadingMore: false,
    loadMoreError: false,
    hasMore: defaultHasMore,
  };

  return defineBehavior<ListLoadPrivate>()({
    data: {
      listLoad: defaultState,
    },

    lifetimes: {
      attached() {
        this._listLoadSkeletonShowTimer = null;
        this._listLoadSkeletonHideTimer = null;
        this._listLoadSkeletonShownAt = 0;
      },

      detached() {
        this._listLoadClearTimers();
      },
    },

    methods: {
      _listLoadSet(patch: Partial<ListLoadState>) {
        this.setData({
          listLoad: {
            ...this.data.listLoad,
            ...patch,
          },
        });
      },

      _listLoadClearTimers() {
        if (this._listLoadSkeletonShowTimer) {
          clearTimeout(this._listLoadSkeletonShowTimer);
          this._listLoadSkeletonShowTimer = null;
        }

        if (this._listLoadSkeletonHideTimer) {
          clearTimeout(this._listLoadSkeletonHideTimer);
          this._listLoadSkeletonHideTimer = null;
        }
      },

      /**
       * 首屏加载开始
       */
      _listLoadBeginInitial() {
        this._listLoadClearTimers();

        this._listLoadSet({
          phase: 'initial',
          skeletonVisible: false,
          initialError: false,
          loadMoreError: false,
        });

        this._listLoadSkeletonShowTimer = setTimeout(() => {
          this._listLoadSkeletonShownAt = Date.now();
          this._listLoadSet({
            skeletonVisible: true,
          });
          this._listLoadSkeletonShowTimer = null;
        }, skeletonDelay);
      },

      /**
       * 首屏加载结束
       */
      _listLoadEndInitial(options: { success: boolean; hasContent: boolean; hasMore?: boolean }) {
        if (this._listLoadSkeletonShowTimer) {
          clearTimeout(this._listLoadSkeletonShowTimer);
          this._listLoadSkeletonShowTimer = null;
        }

        const finish = () => {
          this._listLoadSet({
            phase: 'idle',
            skeletonVisible: false,
            initialError: !options.success && !options.hasContent,
            hasMore:
              typeof options.hasMore === 'boolean' ? options.hasMore : this.data.listLoad.hasMore,
          });

          this._listLoadSkeletonHideTimer = null;
        };

        if (!this.data.listLoad.skeletonVisible) {
          finish();
          return;
        }

        const visibleDuration = Date.now() - this._listLoadSkeletonShownAt;
        const remain = Math.max(0, minSkeletonDuration - visibleDuration);

        if (remain > 0) {
          this._listLoadSkeletonHideTimer = setTimeout(finish, remain);
        } else {
          finish();
        }
      },

      /**
       * 是否允许下拉刷新
       */
      _listLoadCanRefresh(extraBlock = false) {
        const { phase, loadingMore } = this.data.listLoad;

        return !(phase === 'initial' || phase === 'refresh' || loadingMore || extraBlock);
      },

      /**
       * 下拉刷新开始
       */
      _listLoadBeginRefresh() {
        this._listLoadSet({
          phase: 'refresh',
          refreshing: true,
          loadMoreError: false,
        });
      },

      /**
       * 下拉刷新结束
       */
      _listLoadEndRefresh(options: { success: boolean; hasContent: boolean; hasMore?: boolean }) {
        this._listLoadSet({
          phase: 'idle',
          refreshing: false,
          initialError: !options.success && !options.hasContent,
          hasMore:
            typeof options.hasMore === 'boolean' ? options.hasMore : this.data.listLoad.hasMore,
        });
      },

      /**
       * 是否允许分页加载
       */
      _listLoadCanMore(extraBlock = false) {
        const { phase, hasMore, loadMoreError } = this.data.listLoad;

        return !(
          phase === 'initial' ||
          phase === 'refresh' ||
          phase === 'more' ||
          !hasMore ||
          loadMoreError ||
          extraBlock
        );
      },

      /**
       * 分页加载开始
       */
      _listLoadBeginMore() {
        this._listLoadSet({
          phase: 'more',
          loadingMore: true,
          loadMoreError: false,
        });
      },

      /**
       * 分页加载结束
       */
      _listLoadEndMore(options: { success: boolean; hasMore?: boolean }) {
        this._listLoadSet({
          phase: 'idle',
          loadingMore: false,
          loadMoreError: !options.success,
          hasMore:
            typeof options.hasMore === 'boolean' ? options.hasMore : this.data.listLoad.hasMore,
        });
      },

      /**
       * 分页失败后，用户点击重试前调用
       */
      _listLoadResetMoreError() {
        this._listLoadSet({
          loadMoreError: false,
        });
      },

      /**
       * 完整重置，比如切换筛选、切换 tab、切换关键词
       */
      _listLoadReset(next?: Partial<ListLoadState>) {
        this._listLoadClearTimers();

        this.setData({
          listLoad: {
            ...defaultState,
            phase: 'idle',
            skeletonVisible: false,
            ...next,
          },
        });
      },
    },
  });
}
