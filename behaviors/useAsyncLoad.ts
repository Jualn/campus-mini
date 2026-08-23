import defineBehavior from '../utils/defineBehavior';

export type AsyncLoadPhase = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncLoadState {
  phase: AsyncLoadPhase;
  loading: boolean;
  skeletonVisible: boolean;
  error: boolean;
  loaded: boolean;
  errorMessage: string;
}

const defaultState: AsyncLoadState = {
  phase: 'idle',
  loading: false,
  skeletonVisible: false,
  error: false,
  loaded: false,
  errorMessage: '',
};

interface AsyncLoadPrivate {
  _asyncLoadShowTimer: number | null;
  _asyncLoadHideTimer: number | null;
  _asyncLoadSkeletonShownAt: number;
}

export interface UseAsyncLoadOptions {
  /** 延迟显示骨架，避免快速请求造成闪烁。 */
  skeletonDelay?: number;

  /** 骨架出现后的最短展示时间，避免动画刚出现就消失。 */
  minSkeletonDuration?: number;
}

/**
 * 普通异步页面加载状态。
 *
 * 列表页继续使用 useListLoad；详情页、设置页、单次初始化页面使用这个 behavior。
 */
export function useAsyncLoad(options: UseAsyncLoadOptions = {}) {
  const { skeletonDelay = 120, minSkeletonDuration = 260 } = options;

  return defineBehavior<AsyncLoadPrivate>()({
    data: {
      asyncLoad: defaultState,
    },

    lifetimes: {
      attached() {
        this._asyncLoadShowTimer = null;
        this._asyncLoadHideTimer = null;
        this._asyncLoadSkeletonShownAt = 0;
      },

      detached() {
        this._asyncLoadClearTimers();
      },
    },

    methods: {
      _asyncLoadSet(patch: Partial<AsyncLoadState>) {
        this.setData({
          asyncLoad: {
            ...this.data.asyncLoad,
            ...patch,
          },
        });
      },

      _asyncLoadClearTimers() {
        if (this._asyncLoadShowTimer) {
          clearTimeout(this._asyncLoadShowTimer);
          this._asyncLoadShowTimer = null;
        }

        if (this._asyncLoadHideTimer) {
          clearTimeout(this._asyncLoadHideTimer);
          this._asyncLoadHideTimer = null;
        }
      },

      _asyncLoadBegin(options: { preserveError?: boolean } = {}) {
        this._asyncLoadClearTimers();
        this._asyncLoadSkeletonShownAt = 0;

        if (options.preserveError) {
          this._asyncLoadSet({
            phase: 'error',
            loading: true,
            skeletonVisible: false,
            error: true,
            loaded: false,
          });
          return;
        }

        this._asyncLoadSet({
          phase: 'loading',
          loading: true,
          skeletonVisible: false,
          error: false,
          loaded: false,
          errorMessage: '',
        });

        this._asyncLoadShowTimer = setTimeout(() => {
          this._asyncLoadSkeletonShownAt = Date.now();
          this._asyncLoadSet({ skeletonVisible: true });
          this._asyncLoadShowTimer = null;
        }, skeletonDelay);
      },

      _asyncLoadSuccess() {
        this._asyncLoadFinish({ success: true });
      },

      _asyncLoadFail(message = '') {
        this._asyncLoadFinish({ success: false, message });
      },

      _asyncLoadFinish(result: { success: boolean; message?: string }) {
        if (this._asyncLoadShowTimer) {
          clearTimeout(this._asyncLoadShowTimer);
          this._asyncLoadShowTimer = null;
        }

        const finish = () => {
          this._asyncLoadSet({
            phase: result.success ? 'success' : 'error',
            loading: false,
            skeletonVisible: false,
            error: !result.success,
            loaded: result.success,
            errorMessage: result.success ? '' : (result.message ?? ''),
          });
          this._asyncLoadHideTimer = null;
        };

        if (!this.data.asyncLoad.skeletonVisible) {
          finish();
          return;
        }

        const visibleDuration = Date.now() - this._asyncLoadSkeletonShownAt;
        const remain = Math.max(0, minSkeletonDuration - visibleDuration);

        if (remain > 0) {
          this._asyncLoadHideTimer = setTimeout(finish, remain);
        } else {
          finish();
        }
      },

      _asyncLoadReset(next?: Partial<AsyncLoadState>) {
        this._asyncLoadClearTimers();
        this.setData({
          asyncLoad: {
            ...defaultState,
            ...next,
          },
        });
      },
    },
  });
}
