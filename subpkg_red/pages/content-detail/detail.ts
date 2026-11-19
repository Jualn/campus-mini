import { watchCurrentAccount } from '../../../actions/current-user';
import { isHttpError, isAuthError } from '../../../utils/error';
import { getOfficialContent, type OfficialDetail } from '../../services/official-content';
interface Data {
  content: OfficialDetail | null;
  loading: boolean;
  error: string;
  failedMedia: Record<string, boolean>;
}
interface Custom {
  _offAccount: (() => void) | null;
  _id: string;
  _alive: boolean;
  _generation: number;
  load: () => Promise<void>;
  previewImage: (event: WechatMiniprogram.TouchEvent) => void;
  mediaError: (event: WechatMiniprogram.TouchEvent) => void;
  retryMedia: (event: WechatMiniprogram.TouchEvent) => void;
}
Page<Data, Custom>({
  data: {
    content: null,
    loading: false,
    error: '',
    failedMedia: {},
  },
  _id: '',
  _alive: true,
  _offAccount: null,
  _generation: 0,
  onLoad(options) {
    this._id =
      typeof options.id === 'string' && /^[1-9][0-9]{0,18}$/.test(options.id) ? options.id : '';
    this._alive = true;
    this._offAccount = watchCurrentAccount(() => {
      ++this._generation;
      this.setData({ content: null, loading: false, error: '登录身份已变化，请重新查询' });
    });
  },
  onShow() {
    void this.load();
  },
  onUnload() {
    this._offAccount?.();
    this._alive = false;
    ++this._generation;
  },
  async load() {
    if (!this._id) {
      this.setData({ error: '内容地址无效' });
      return;
    }
    const generation = ++this._generation;
    this.setData({ loading: !this.data.content, error: '' });
    try {
      const content = await getOfficialContent(this._id);
      if (this._alive && generation === this._generation)
        this.setData({ content, failedMedia: {} });
    } catch (error) {
      if (this._alive && generation === this._generation)
        this.setData({
          ...(isAuthError(error) ||
          (isHttpError(error) && [401, 403, 404].includes(error.statusCode))
            ? { content: null }
            : {}),
          error: error instanceof Error ? error.message : '内容暂不可用，请重试',
        });
    } finally {
      if (this._alive && generation === this._generation) this.setData({ loading: false });
    }
  },
  previewImage(event) {
    const content = this.data.content;
    const current = event.currentTarget.dataset.url as string | undefined;
    if (content && current && content.images.some((item) => item.url === current))
      void wx.previewImage({ current, urls: content.images.map((item) => item.url) });
  },
  mediaError(event) {
    const key = String(event.currentTarget.dataset.key ?? '');
    if (key) this.setData({ [`failedMedia.${key}`]: true });
  },
  retryMedia(event) {
    const key = String(event.currentTarget.dataset.key ?? '');
    if (key) this.setData({ [`failedMedia.${key}`]: false });
  },
});
