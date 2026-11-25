import { type ArticleFile } from '../../services/article-files';
import defineComponent from '../../../utils/defineComponent';

interface ArticleFileView extends ArticleFile {
  sizeLabel: string;
  typeLabel: string;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${String(sizeBytes)} B`;
  if (sizeBytes < 1048576) return `${String(Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / 1048576).toFixed(1)} MB`;
}

function mapFileViews(files: ArticleFile[]): ArticleFileView[] {
  return files.map((file) => ({
    ...file,
    sizeLabel: formatFileSize(file.sizeBytes),
    typeLabel: file.fileType.toUpperCase(),
  }));
}

defineComponent<{ _task: WechatMiniprogram.DownloadTask | null; _generation: number }>()({
  properties: { files: { type: Array, value: [] } },
  data: { pendingId: '', error: '', views: [] as ArticleFileView[] },
  observers: {
    files(files: ArticleFile[]) {
      this.setData({ views: mapFileViews(files) });
    },
  },
  methods: {
    cancel() {
      ++this._generation;
      this._task?.abort();
      this._task = null;
      this.setData({ pendingId: '' });
    },
    async open(event: WechatMiniprogram.TouchEvent) {
      if (this.data.pendingId) return;
      const file = (this.properties.files as ArticleFile[]).find(
        (f) => f.attachmentId === event.currentTarget.dataset.id,
      );
      if (!file) return;
      const generation = ++this._generation;
      this.setData({ pendingId: file.attachmentId, error: '' });
      try {
        if (!wx.canIUse('openDocument')) throw new Error('当前微信版本无法打开文档');
        const path = await new Promise<string>((resolve, reject) => {
          this._task = wx.downloadFile({
            url: file.url,
            success: (r) => {
              if (r.statusCode === 200 && r.tempFilePath) resolve(r.tempFilePath);
              else reject(new Error('文件下载失败，请重试'));
            },
            fail: () => {
              reject(new Error('文件暂不可用，请检查网络后重试'));
            },
          });
        });
        if (generation !== this._generation) return;
        this._task = null;
        await new Promise<void>((resolve, reject) => {
          wx.openDocument({
            filePath: path,
            fileType: file.fileType,
            showMenu: true,
            success: () => {
              resolve();
            },
            fail: () => {
              reject(new Error('文件无法打开，请重试或稍后查看'));
            },
          });
        });
      } catch (e) {
        if (generation === this._generation)
          this.setData({ error: e instanceof Error ? e.message : '文件暂不可用，请重试' });
      } finally {
        if (generation === this._generation) {
          this._task = null;
          this.setData({ pendingId: '' });
        }
      }
    },
  },
  pageLifetimes: {
    hide() {
      this.cancel();
    },
  },
  lifetimes: {
    attached() {
      this._task = null;
      this._generation = 0;
      this.setData({ views: mapFileViews(this.properties.files) });
    },
    detached() {
      this.cancel();
    },
  },
});
