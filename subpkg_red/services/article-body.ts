import {
  record,
  string,
  boolean,
  id,
  mapArticle,
  mapMedia,
  type Article,
  type Media,
} from './article';
export interface Run {
  text: string;
  key: number;
  className: string;
  href: string;
}
export interface BodyNode {
  key: number;
  type: string;
  align: string;
  level: number;
  runs: Run[];
  items: { runs: Run[]; marker: string }[];
  url: string;
  poster: string;
  caption: string;
  alt: string;
  height: number;
}
export interface ReadingArticle {
  article: Article;
  nodes: BodyNode[];
}
const markClasses: Record<string, string> = {
  BOLD: 'run-bold',
  ITALIC: 'run-italic',
  UNDERLINE: 'run-underline',
  STRIKE: 'run-strike',
  CODE: 'run-code',
};
function vocabulary(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('不支持此内容版本');
}
export function safeLink(value: unknown): string {
  const url = string(value);
  // Links are copied after confirmation, never executed or converted into page routes.
  if (
    url.length > 2048 ||
    !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#]|$)/i.test(url) ||
    /[\s<>"\\]/.test(url)
  )
    throw new Error('正文链接不安全');
  const host = url
    .slice(8)
    .split(/[/?#:]/)[0]
    .toLowerCase();
  if (
    !host.includes('.') ||
    /^\d+(?:\.\d+){3}$/.test(host) ||
    /(?:^|\.)(localhost|local|internal)$/.test(host)
  )
    throw new Error('正文链接不安全');
  return url;
}
function runs(value: unknown): Run[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error('不支持此内容版本');
  return value.map((v, key) => {
    const r = record(v),
      marks = r.marks === undefined ? [] : r.marks;
    vocabulary(r, ['text', 'marks', 'href']);
    if (
      !Array.isArray(marks) ||
      marks.some(
        (m: unknown) =>
          typeof m !== 'string' || !Object.prototype.hasOwnProperty.call(markClasses, m),
      )
    )
      throw new Error('不支持此内容版本');
    const href = r.href === undefined ? '' : safeLink(r.href);
    return {
      key,
      text: string(r.text),
      href,
      className: marks.map((mark: string) => markClasses[mark]).join(' '),
    };
  });
}
export function mapReadingArticle(value: unknown): ReadingArticle {
  const r = record(value),
    body = record(r.body);
  vocabulary(body, ['format', 'version', 'nodes']);
  if (
    body.format !== 'ARTICLE_RICH_TEXT' ||
    body.version !== 1 ||
    !Array.isArray(body.nodes) ||
    body.nodes.length > 500
  )
    throw new Error('不支持此内容版本');
  if (!Array.isArray(r.media) || r.media.length > 30) throw new Error('媒体响应不正确');
  const media = new Map<string, Media>();
  r.media.map((m) => mapMedia(m)).forEach((m) => media.set(m.attachmentId, m));
  const resolve = (value: unknown, kind: Media['kind']) => {
    const m = media.get(id(value));
    if (m?.kind !== kind) throw new Error('正文媒体不可用');
    return m;
  };
  const nodes = body.nodes.map((v, key): BodyNode => {
    const n = record(v),
      type = string(n.type);
    const node: BodyNode = {
      key,
      type,
      align: 'left',
      level: 0,
      runs: [],
      items: [],
      url: '',
      poster: '',
      caption: n.caption === undefined ? '' : string(n.caption),
      alt: '',
      height: 420,
    };
    switch (type) {
      case 'PARAGRAPH':
      case 'HEADING':
      case 'QUOTE':
        vocabulary(
          n,
          type === 'QUOTE'
            ? ['type', 'runs']
            : type === 'HEADING'
              ? ['type', 'runs', 'align', 'level']
              : ['type', 'runs', 'align'],
        );
        node.runs = runs(n.runs);
        if (n.align !== undefined) {
          if (!['LEFT', 'CENTER', 'RIGHT'].includes(string(n.align)))
            throw new Error('不支持此内容版本');
          node.align = string(n.align).toLowerCase();
        }
        if (type === 'HEADING') {
          if (n.level !== 1 && n.level !== 2 && n.level !== 3) throw new Error('不支持此内容版本');
          node.level = n.level;
        }
        break;
      case 'LIST':
        vocabulary(n, ['type', 'ordered', 'items']);
        if (!Array.isArray(n.items) || !n.items.length || n.items.length > 100)
          throw new Error('不支持此内容版本');
        {
          const ordered = boolean(n.ordered);
          node.items = n.items.map((row, i) => {
            const entry = record(row);
            vocabulary(entry, ['runs']);
            return { runs: runs(entry.runs), marker: ordered ? `${(i + 1).toString()}.` : '•' };
          });
        }
        break;
      case 'IMAGE':
        vocabulary(n, ['type', 'attachmentId', 'alt', 'caption']);
        node.url = resolve(n.attachmentId, 'IMAGE').url;
        node.alt = string(n.alt);
        break;
      case 'VIDEO': {
        vocabulary(n, ['type', 'attachmentId', 'posterAttachmentId', 'caption']);
        const m = resolve(n.attachmentId, 'VIDEO');
        node.url = m.url;
        node.poster =
          n.posterAttachmentId === undefined ? '' : resolve(n.posterAttachmentId, 'IMAGE').url;
        node.height = Math.max(
          200,
          Math.min(900, Math.round((680 * (m.playback?.height ?? 9)) / (m.playback?.width ?? 16))),
        );
        break;
      }
      case 'DIVIDER':
        vocabulary(n, ['type']);
        break;
      default:
        throw new Error('不支持此内容版本');
    }
    return node;
  });
  return { article: mapArticle(value), nodes };
}
