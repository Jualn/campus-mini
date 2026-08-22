import defineBehavior from '../utils/defineBehavior';

export type AsyncLoadPhase = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncLoadState {
  phase: AsyncLoadPhase;
  loading: boolean;
  error: boolean;
  loaded: boolean;
  errorMessage: string;
}

const defaultState: AsyncLoadState = {
  phase: 'idle',
  loading: false,
  error: false,
  loaded: false,
  errorMessage: '',
};

/**
 * 普通异步页面加载状态。
 *
 * 列表页继续使用 useListLoad；详情页、设置页、单次初始化页面使用这个 behavior。
 */
export function useAsyncLoad() {
  return defineBehavior()({
    data: {
      asyncLoad: defaultState,
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

      _asyncLoadBegin() {
        this._asyncLoadSet({
          phase: 'loading',
          loading: true,
          error: false,
          errorMessage: '',
        });
      },

      _asyncLoadSuccess() {
        this._asyncLoadSet({
          phase: 'success',
          loading: false,
          error: false,
          loaded: true,
          errorMessage: '',
        });
      },

      _asyncLoadFail(message = '') {
        this._asyncLoadSet({
          phase: 'error',
          loading: false,
          error: true,
          loaded: false,
          errorMessage: message,
        });
      },

      _asyncLoadReset(next?: Partial<AsyncLoadState>) {
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
