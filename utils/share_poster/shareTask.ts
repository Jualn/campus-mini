export type ShareStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 同一画布串行绘制；只允许当前任务发布结果。 */
export class ShareTask {
  private revision = 0;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;

  run(
    render: () => Promise<string>,
    publish: (status: ShareStatus, path: string) => void,
    onError?: (error: unknown) => void,
  ): void {
    if (this.disposed) return;
    const revision = ++this.revision;
    const isCurrent = () => !this.disposed && revision === this.revision;
    publish('loading', '');
    this.tail = this.tail.then(async () => {
      if (!isCurrent()) return;
      try {
        const path = await render();
        if (!path) throw new Error('未生成分享图片');
        if (isCurrent()) publish('ready', path);
      } catch (error) {
        if (!isCurrent()) return;
        publish('error', '');
        try {
          onError?.(error);
        } catch {
          // 诊断失败不能中断队列，否则后续重试也无法执行。
        }
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.revision++;
  }
}
