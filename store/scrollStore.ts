// scrollStore.ts

class ScrollStore {
  private map = new Map<string, number>();

  /** 设置 scrollTop */
  set(key: string, top: number) {
    this.map.set(key, top);
  }

  /** 获取 scrollTop，默认 0 */
  get(key: string) {
    return this.map.get(key) ?? 0;
  }

  /** 清除某个页面或者全部 */
  clear(key?: string) {
    if (key) this.map.delete(key);
    else this.map.clear();
  }

  /** 生成唯一 key：route + 参数 */
  genKey(route: string, options: Record<string, unknown> = {}) {
    const params = Object.entries(options)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&');
    return params ? `${route}?${params}` : route;
  }
}

/**
 * ScrollStore 用于在页面切换时保存和恢复 scrollTop，避免用户切换回来后回到顶部
 * 设计为全局单例，使用 route + 参数组合作为 key
 * @example
 * 
 * onUnload() {
    // 离开页面时记录 scrollTop
    const key = scrollStore.genKey(this.route, this.options);
    scrollStore.set(key, this.data._currentScrollTop);
  },

  onShow() {
    // 返回页面时恢复 scrollTop
    const key = scrollStore.genKey(this.route, this.options);
    const top = scrollStore.get(key);
    if (top) {
      wx.pageScrollTo({ scrollTop: top, duration: 0 });
    }
  }
 */
export const scrollStore = new ScrollStore();
