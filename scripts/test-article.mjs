import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const plain = (x) => JSON.parse(JSON.stringify(x));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const pending = [], captured = [], events = [];
const http = Object.fromEntries(['get', 'post', 'put', 'del'].map((method) => [method, (url, data, options) => new Promise((resolve, reject) => pending.push({ method, url, data, options, resolve, reject }))]));
const take = (method, path) => { const i = pending.findIndex((r) => r.method === method && r.url.endsWith(path)); assert.ok(i >= 0, `Missing ${method} ${path}`); return pending.splice(i, 1)[0]; };
const wxCalls = [];
const wx = { hideShareMenu() {}, showShareMenu() {}, stopPullDownRefresh() {}, showToast: (r) => wxCalls.push(['toast', r]), showModal: (r) => r.success({ confirm: true }), setClipboardData: (r) => wxCalls.push(['clipboard', r]), previewImage: (r) => wxCalls.push(['preview', r]), createVideoContext: (id) => ({ pause: () => wxCalls.push(['pause', id]) }), navigateTo: (r) => wxCalls.push(['navigate', r]) };
const identity = { id: 'user-1', nickname: '我' };
const identityWatchers = new Set();
const mocks = new Map([
  [path.join(root, 'utils/request.ts'), { http }],
  [path.join(root, 'utils/cos.ts'), {}],
  [path.join(root, 'actions/current-user.ts'), { getCurrentIdentity: () => identity, watchCurrentIdentity: (fn) => { identityWatchers.add(fn); return () => identityWatchers.delete(fn); }, watchCurrentAccount: (fn) => { identityWatchers.add(fn); return () => identityWatchers.delete(fn); } }],
  [path.join(root, 'utils/wx-promise.ts'), { wxNavigateTo: (r) => wxCalls.push(['navigate', r]) }],
  [path.join(root, 'utils/notify.ts'), { showInfoToast: (title) => wxCalls.push(['toast', { title }]) }],
]);
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (mocks.has(filename)) return mocks.get(filename);
  if (cache.has(filename)) return cache.get(filename);
  const exports = {}; cache.set(filename, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts'))), Page: (d) => captured.push(d), Component: (d) => captured.push(d), wx, Error, Set, Map, Date }, { filename });
  return exports;
}
function instance(definition, properties = {}) {
  const obj = { ...definition, ...definition.methods, properties, data: plain(definition.data), setData(patch) { for (const [key, value] of Object.entries(patch)) { const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let at = this.data; keys.slice(0, -1).forEach((k) => { if (!at[k]) at[k] = {}; at = at[k]; }); at[keys.at(-1)] = value; } }, triggerEvent: (name, detail) => events.push({ name, detail }), getOpenerEventChannel: () => ({ emit: (name, detail) => events.push({ name, detail }) }) };
  return obj;
}
// Assert the shipped default, then isolate legacy compatibility scenarios.
const configuredCapabilities = load('subpkg_red/services/article-capabilities.ts').ARTICLE_CAPABILITIES;
assert.equal(configuredCapabilities.contentV1, true);
configuredCapabilities.contentV1 = false;
const api = load('subpkg_red/services/article.ts');
const body = load('subpkg_red/services/article-body.ts');
const { HttpError } = load('utils/error.ts');
const category = { id: 'category-opaque', name: '党建', enabled: true, displayOrder: 0, createdAt: '2026-10-13T10:00:00+08:00', updatedAt: '2026-10-13T10:00:00+08:00' };
const stats = { viewCount: 2, likeCount: 3, commentCount: 4, shareCount: 5 };
const summary = { id: 'article-A / 中文', title: '文章标题', summary: '', category, publisher: { id: 'official', displayName: '官方主体' }, publishedAt: '2026-10-13T10:00:00+08:00', commentsEnabled: true, statistics: stats };
const image = { attachmentId: 'image-1', kind: 'IMAGE', name: '照片', url: 'https://example.org/a.jpg' };
const video = { attachmentId: 'video-1', kind: 'VIDEO', name: '视频', url: 'https://example.org/a.mp4', playback: { contentType: 'video/mp4', width: 1920, height: 1080, durationSeconds: 10 } };
const detail = { ...summary, plainText: '文本', media: [image, video], body: { format: 'ARTICLE_RICH_TEXT', version: 1, nodes: [
  { type: 'HEADING', level: 1, align: 'CENTER', runs: [{ text: '标题' }] },
  { type: 'PARAGRAPH', runs: [{ text: '<script>literal</script>\n段落', marks: ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKE', 'CODE'], href: 'https://example.org/link' }] },
  { type: 'QUOTE', runs: [{ text: '引用' }] },
  { type: 'LIST', ordered: true, items: [{ runs: [{ text: '项目' }] }] },
  { type: 'IMAGE', attachmentId: 'image-1', alt: '描述', caption: '图片注释' },
  { type: 'VIDEO', attachmentId: 'video-1', posterAttachmentId: 'image-1', caption: '视频注释' },
  { type: 'DIVIDER' },
] } };
const comment = (id, extra = {}) => ({ id, targetType: 'ARTICLE', targetId: summary.id, content: '评论', author: { userId: 'user-1', nickname: '小明', avatarUrl: null, isPlatformOperator: false }, createdAt: summary.publishedAt, likeCount: 0, liked: false, replyCount: 0, ...extra });

// Canonical response mapping: no old hasMore/envelope or integer target assumptions.
assert.deepEqual(plain(api.mapArticle(summary)), { ...summary, publisherDisplayName: summary.publisher.displayName });
// Organization-publisher V2: one display policy for list and detail, no directory
// lookups, current-name fallback, default organization, or legacy-ID conversion.
const { publisher: oldPublisher, ...withoutPublisher } = summary;
const orgSummary = { ...withoutPublisher, publisherOrgId: 'org-opaque / 中文', publisherNameSnapshot: '发布时可信组织名称' };
const mappedOrg = api.mapArticle(orgSummary);
assert.equal(mappedOrg.publisherDisplayName, orgSummary.publisherNameSnapshot);
assert.equal(mappedOrg.publisherOrgId, orgSummary.publisherOrgId);
assert.equal(mappedOrg.publisher, undefined);
assert.deepEqual(plain(api.mapArticle({ ...orgSummary, publisher: { id: '1', displayName: '后来改名的旧主体' } })), plain(mappedOrg));
assert.deepEqual(plain(api.mapArticle({ ...orgSummary, publisher: null })), plain(mappedOrg));
for (const invalidSnapshot of [undefined, null, '', '  \n', 123, '名'.repeat(121)]) {
  assert.throws(() => api.mapArticle({ ...orgSummary, publisherNameSnapshot: invalidSnapshot, publisher: oldPublisher }));
}
for (const invalidOrgId of [null, '', 1]) assert.throws(() => api.mapArticle({ ...orgSummary, publisherOrgId: invalidOrgId, publisher: oldPublisher }));
assert.equal(api.mapArticle({ ...orgSummary, publisherNameSnapshot: '😀'.repeat(120) }).publisherDisplayName, '😀'.repeat(120));
for (const invalidLegacy of [undefined, null, {}, { id: '1', displayName: '' }, { id: '1', displayName: ' ' }]) assert.throws(() => api.mapArticle({ ...withoutPublisher, publisher: invalidLegacy }));
const legacyMapped = api.mapArticle({ ...summary, publisher: { ...oldPublisher, organizationId: 'unverified-org' }, publisherNameSnapshot: '无组织绑定的孤立字段' });
assert.equal(legacyMapped.publisherDisplayName, oldPublisher.displayName);
assert.equal(legacyMapped.publisherOrgId, undefined);
assert.equal(legacyMapped.publisherNameSnapshot, undefined);
assert.equal(api.mapArticle({ ...summary, publisher: { id: '1', displayName: '同名组织' } }).publisherOrgId, undefined);
assert.equal(api.mapArticle({ ...summary, publisher: { id: 'same-name', displayName: '同名组织' } }).publisherDisplayName, '同名组织');
const mixedPage = api.mapPage({ items: [orgSummary, summary] }, api.mapArticle);
assert.deepEqual(plain(mixedPage.items.map((a) => a.publisherDisplayName)), [orgSummary.publisherNameSnapshot, oldPublisher.displayName]);
assert.equal(body.mapReadingArticle({ ...detail, ...orgSummary }).article.publisherDisplayName, orgSummary.publisherNameSnapshot);
// Inactive organizations do not change the public representation: no organization
// status/lookup may be used to hide an otherwise published article or replace its label.
assert.equal(api.mapArticle({ ...orgSummary, publisher: { ...oldPublisher, displayName: '组织停用后当前名称' } }).publisherDisplayName, orgSummary.publisherNameSnapshot);
const orgListLoad = api.listArticles(); take('get', '/v1/articles').resolve({ items: [orgSummary, summary] }); assert.equal((await orgListLoad).items.length, 2);
const canonicalArticleSchema = JSON.parse(fs.readFileSync(path.join(root, '../contracts/api/schemas/article.yaml'), 'utf8'));
for (const fixture of canonicalArticleSchema.ArticleSummary.examples) {
  const result = api.mapArticle(fixture);
  assert.equal(result.publisherDisplayName, fixture.publisherOrgId ? fixture.publisherNameSnapshot : fixture.publisher.displayName);
}
assert.equal(api.mapArticle({ ...summary, category: { ...category, enabled: false } }).category.enabled, false);
// The deployed Article response emits all four Java long counters as decimal strings.
const wireStats = { viewCount: '0', likeCount: '0', commentCount: '0', shareCount: '0' };
const zeroStats = { viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0 };
assert.deepEqual(plain(api.mapArticle({ ...summary, statistics: wireStats }).statistics), zeroStats);
assert.deepEqual(plain(body.mapReadingArticle({ ...detail, statistics: wireStats }).article.statistics), zeroStats);
assert.deepEqual(plain(api.mapLike({ liked: true, likeCount: '12' })), { liked: true, likeCount: 12 });
const mappedWireComment = api.mapComment(comment('wire', { likeCount: '2', replyCount: '3' }), summary.id);
assert.equal(mappedWireComment.likeCount, 2);
assert.equal(mappedWireComment.replyCount, 3);
for (const likeCount of ['', ' 0', '0\n', '-1', '1.5', '1e2', '0x10', '9007199254740993']) {
  assert.throws(() => api.mapArticle({ ...summary, statistics: { ...wireStats, likeCount } }), /资讯统计格式不正确/);
}
assert.throws(() => api.mapArticle({ ...summary, statistics: { ...stats, likeCount: -1 } }));
assert.throws(() => api.mapPage({ items: [], nextCursor: '' }, api.mapArticle));
assert.equal(api.mapPage({ items: [] }, api.mapArticle).nextCursor, undefined);
assert.throws(() => api.mapComment(comment('x', { targetType: 'POST' }), summary.id));
assert.throws(() => api.mapComment(comment('x', { targetId: 'another' }), summary.id));
const reading = body.mapReadingArticle(detail);
assert.deepEqual(plain(reading.nodes.map((n) => n.type)), ['HEADING', 'PARAGRAPH', 'QUOTE', 'LIST', 'IMAGE', 'VIDEO', 'DIVIDER']);
assert.equal(reading.nodes[0].align, 'center');
assert.equal(reading.nodes[1].runs[0].text, '<script>literal</script>\n段落');
// All subsets of the five supported marks, alone and with a link, across text nodes.
const markNames = ['BOLD', 'ITALIC', 'UNDERLINE', 'STRIKE', 'CODE'];
const runClasses = ['run-bold', 'run-italic', 'run-underline', 'run-strike', 'run-code'];
const markedRuns = Array.from({ length: 32 }, (_, mask) => {
  const marks = markNames.filter((_, i) => mask & (1 << i));
  return [false, true].map((linked) => ({ text: `中文 Ab ${mask}\n下一行`, marks,
    ...(linked ? { href: 'https://example.org/format' } : {}) }));
}).flat();
const alignments = ['LEFT', 'CENTER', 'RIGHT'];
const markedNodes = [
  ...alignments.flatMap((align) => [
    { type: 'PARAGRAPH', align, runs: markedRuns },
    ...[1, 2, 3].map((level) => ({ type: 'HEADING', level, align, runs: markedRuns })),
  ]),
  { type: 'QUOTE', runs: markedRuns },
  { type: 'LIST', ordered: false, items: [{ runs: markedRuns }, { runs: [] }] },
  { type: 'LIST', ordered: true, items: [{ runs: markedRuns }, { runs: [] }] },
];
const projected = body.mapReadingArticle({ ...detail, body: { ...detail.body, nodes: markedNodes } }).nodes;
for (const [index, node] of projected.entries()) {
  const input = markedNodes[index];
  assert.equal(node.type, input.type);
  assert.equal(node.align, (input.align ?? 'LEFT').toLowerCase());
  if (input.type === 'HEADING') assert.equal(node.level, input.level);
  if (input.type === 'LIST') {
    assert.deepEqual(plain(node.items.map((item) => item.marker)), input.ordered ? ['1.', '2.'] : ['•', '•']);
  }
  const runs = node.type === 'LIST' ? node.items[0].runs : node.runs;
  for (const [i, run] of runs.entries()) {
    const expected = runClasses.filter((_, bit) => (i >> 1) & (1 << bit));
    assert.equal(run.className, expected.join(' '));
    assert.equal(run.key, i);
    assert.equal(run.text, markedRuns[i].text);
    assert.equal(run.href, markedRuns[i].href ?? '');
  }
}
for (const node of [{ type: 'QUOTE', runs: [] }, { type: 'LIST', ordered: true, items: [{ runs: [] }] }]) {
  assert.throws(() => body.mapReadingArticle({ ...detail, body: { ...detail.body, nodes: [{ ...node, align: 'CENTER' }] } }), /不支持此内容版本/);
}
const runTemplate = fs.readFileSync(path.join(root, 'subpkg_red/components/article-body/index.wxml'), 'utf8');
const runStyles = fs.readFileSync(path.join(root, 'subpkg_red/components/article-body/index.wxss'), 'utf8');
assert.match(runTemplate, /class="run-group" user-select="true"><text[^>]+run\.className[^>]+link run-underline/);
assert.match(runStyles, /\.run-underline\.run-strike\s*\{\s*text-decoration: underline line-through;/);
assert.equal(reading.nodes[3].items[0].marker, '1.');
assert.equal(reading.nodes[5].poster, image.url);
assert.equal(reading.nodes[5].height, 383);
for (const changes of [{ version: 2 }, { format: 'HTML' }, { unsupported: true }, { nodes: [{ type: 'TABLE' }] }, { nodes: [{ type: 'IMAGE', attachmentId: 'missing', alt: '' }] }, { nodes: [{ type: 'PARAGRAPH', runs: [{ text: 'x', marks: ['UNKNOWN'] }] }] }, { nodes: [{ type: 'PARAGRAPH', css: 'color:red', runs: [] }] }, { nodes: [{ type: 'PARAGRAPH', runs: [{ text: 'x', marks: ['constructor'] }] }] }]) assert.throws(() => body.mapReadingArticle({ ...detail, body: { ...detail.body, ...changes } }));
assert.throws(() => body.mapReadingArticle({ ...detail, media: [image, { ...video, playback: undefined }] }));
const basicVideo = { ...video, playback: { contentType: 'video/mp4' } };
assert.equal(api.mapMedia(basicVideo).playback.width, undefined);
assert.equal(body.mapReadingArticle({ ...detail, media: [image, basicVideo] }).nodes[5].height, 383);
assert.throws(() => api.mapMedia({ ...video, playback: { contentType: 'video/mp4', width: 1920 } }));
assert.throws(() => api.mapMedia({ ...video, playback: { contentType: 'video/mp4', width: null, height: null, durationSeconds: null } }));
for (const url of ['javascript:alert(1)', 'https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.1/a', 'https://example.org\\@evil.org/', 'https://example.org/"onclick=']) assert.throws(() => body.safeLink(url));
const query = api.listArticles(category.id, 'cursor-A');
const q = take('get', '/v1/articles'); assert.deepEqual(plain(q.data), { categoryId: category.id, cursor: 'cursor-A', pageSize: 20 }); q.resolve({ items: [summary], nextCursor: 'cursor-B' }); assert.equal((await query).nextCursor, 'cursor-B');
const categories = api.listCategories(); take('get', '/v1/article-categories').resolve({ items: [category, { ...category, id: 'disabled', enabled: false }] }); assert.equal((await categories).length, 1);
for (const [liked, method] of [[true, 'put'], [false, 'del']]) { const operation = api.setLike('ARTICLE', summary.id, liked); const req = take(method, '/like'); assert.match(req.url, /\/ARTICLE\/article-A%20%2F%20%E4%B8%AD%E6%96%87\/like$/); assert.equal(req.options.retryAuth, false); req.resolve({ liked, likeCount: 1 }); await operation; }
const create = api.createComment(summary.id, '回复', 'root', 'reply'); const cr = take('post', '/comments'); assert.deepEqual(plain(cr.data), { content: '回复', parentId: 'root', replyToCommentId: 'reply' }); cr.resolve(comment('new', { parentId: 'root', replyToCommentId: 'reply' })); await create;

// Page pagination: category race, duplicate suppression, retry preserves failed cursor.
load('subpkg_red/pages/article-list/list.ts'); const list = instance(captured.pop());
const oldLoad = list.load(); const old = take('get', '/v1/articles');
list.data.categoryId = category.id; const newLoad = list.load(); take('get', '/v1/articles').resolve({ items: [orgSummary], nextCursor: 'next' }); await newLoad;
assert.equal(list.data.items[0].publisherDisplayName, orgSummary.publisherNameSnapshot);
old.resolve({ items: [{ ...summary, id: 'stale' }] }); await oldLoad; assert.equal(list.data.items[0].id, summary.id);
const more = list.more(); const m = take('get', '/v1/articles'); assert.equal(m.data.cursor, 'next'); m.reject(new Error('offline')); await more; assert.equal(list.data.items.length, 1); assert.equal(list._cursor, 'next');
const retry = list.load(true); take('get', '/v1/articles').resolve({ items: [summary, { ...summary, id: 'article-B' }] }); await retry; assert.equal(list.data.items.length, 2); assert.equal(list.data.hasMore, false);
list.open({ detail: { articleId: summary.id } }); const nav = wxCalls.at(-1)[1]; assert.equal(nav.url, api.articleRoute(summary.id)); nav.events.articleChanged({ id: summary.id, statistics: { ...stats, likeCount: 99 }, liked: true }); assert.equal(list.data.items[0].statistics.likeCount, 99); assert.equal(list.data.items[0].liked, true);

// Independent detail entry, chunked reading, authoritative likes, unknown POST outcomes.
load('subpkg_red/pages/article-detail/detail.ts'); const detailDef = captured.pop(), page = instance(detailDef); page.onLoad({ articleId: summary.id });
const loading = page.load(); take('get', encodeURIComponent(summary.id)).resolve({ ...detail, ...orgSummary, publisher: undefined, body: { ...detail.body, nodes: Array.from({ length: 45 }, () => detail.body.nodes[1]) } }); await loading;
assert.equal(page.data.article.publisherDisplayName, orgSummary.publisherNameSnapshot);
assert.equal(page.data.nodes.length, 20); page.moreBody(); assert.equal(page.data.nodes.length, 40); page.moreBody(); assert.equal(page.data.nodes.length, 45); assert.equal(page.data.hasMoreBody, false);
take('get', '/like').resolve({ liked: false, likeCount: 3 }); take('post', '/views').resolve({ ...stats, viewCount: 10 }); await flush(); assert.equal(page.data.article.statistics.viewCount, 10);
const liking = page.like(); assert.equal(page.data.likePending, true); await page.like(); const l = take('put', '/like'); l.resolve({ liked: true, likeCount: 20 }); await liking; assert.equal(page.data.article.statistics.likeCount, 20);
const oldStatus = page.loadLike(page._generation), oldLikeReq = take('get', '/like'); const newStatus = page.loadLike(page._generation); take('get', '/like').resolve({ liked: true, likeCount: 20 }); await newStatus;
const unlike = page.like(); take('del', '/like').resolve({ liked: false, likeCount: 19 }); await unlike; oldLikeReq.resolve({ liked: true, likeCount: 20 }); await oldStatus; assert.equal(page.data.liked, false); assert.equal(page.data.article.statistics.likeCount, 19);
page.countChange({ detail: { delta: 1 } }); assert.equal(page.data.article.statistics.commentCount, 5);
page.commentsDisabled(); assert.equal(page.data.article.commentsEnabled, false);
const sharing = page.onShareAppMessage(); assert.equal(sharing.path, api.articleRoute(summary.id)); const sh = take('post', '/shares'); assert.equal(sh.data.platform, 'WECHAT_FRIEND'); sh.reject(new Error('timeout')); await flush(); assert.equal(pending.filter((r) => r.url.endsWith('/shares')).length, 0);
page.onShareTimeline(); take('post', '/shares').resolve(stats); await flush();
const reread = page.load(); take('get', encodeURIComponent(summary.id)).resolve(detail); await reread; assert.equal(pending.filter((r) => r.url.endsWith('/views')).length, 0); take('get', '/like').resolve({ liked: true, likeCount: 3 }); await flush();
const beforeHideArticle = page.data.article; const hidingLoad = page.load(); const hidden = take('get', encodeURIComponent(summary.id)); page.onHide(); hidden.resolve(detail); await hidingLoad; assert.equal(page.data.article, beforeHideArticle, 'hiding retains the last authorized reader; late response cannot replace it');
const unavailable = page.load(); take('get', encodeURIComponent(summary.id)).reject(new HttpError(404)); await unavailable; assert.equal(page.data.article, null); assert.equal(page.data.error, '文章不存在或已下架'); assert.ok(events.some((e) => e.detail?.unavailable));

// Canonical comments: closed history, replies, COMMENT likes, owner delete and count deltas.
load('subpkg_red/components/article-comments/index.ts'); const cd = captured.pop(); const cp = instance(cd, { articleId: summary.id, enabled: false, writeReady: true, totalCount: 4, focusCommentId: '' }); cd.lifetimes.attached.call(cp);
take('get', '/comments').resolve({ items: [comment('root', { replyCount: 2 })] }); await flush(); cp.data.draft = '禁止新增'; await cp.send(); assert.equal(pending.length, 0);
cp.properties.writeReady = false; cp.data.draft = '刷新期间保留'; await cp.send(); await cp.like({ currentTarget: { dataset: { id: 'root' } } }); assert.equal(pending.length, 0); assert.equal(cp.data.draft, '刷新期间保留'); cp.properties.writeReady = true;
const rootLike = cp.like({ currentTarget: { dataset: { id: 'root' } } }); const cl = take('put', '/like'); assert.match(cl.url, /\/COMMENT\/root\/like$/); cl.resolve({ liked: true, likeCount: 7 }); await rootLike; assert.equal(cp.data.comments[0].likeCount, 7);
cp.openThread({ currentTarget: { dataset: { id: 'root' } } }); const thread = take('get', '/comments'); assert.equal(thread.data.parentId, 'root'); thread.resolve({ items: [comment('reply', { parentId: 'root' })], nextCursor: 'replies-next' }); await flush(); assert.equal(cp.data.repliesMore, true);
const replyPage = cp.loadReplies(true), replyPageRequest = take('get', '/comments');
const replyLike = cp.like({ currentTarget: { dataset: { id: 'reply' } } });
take('put', '/like').resolve({ liked: true, likeCount: 1 }); await replyLike;
replyPageRequest.resolve({ items: [comment('reply-page-2', { parentId: 'root', replyToCommentId: 'reply' })] }); await replyPage;
assert.deepEqual(plain(cp.data.replies.map((item) => [item.id, item.liked])), [['reply', true], ['reply-page-2', false]]);
assert.equal(cp.data.replies[1].replyToName, '小明');
cp.startWriting();
assert.equal(cp.data.composing, false, 'closed comments cannot open the composer');
cp.properties.enabled = true;
cp.startWriting();
assert.equal(cp.data.inputFocus, true);
assert.equal(cp.data.replyToId, '');
cp.onKeyboardHeightChange({ detail: { height: 260 } });
assert.equal(cp.data.keyboardBottom, 260);
cp.closeComposer();
assert.equal(cp.data.composing, false);
assert.equal(cp.data.keyboardBottom, 0);
cp.properties.enabled = true; cp.reply({ currentTarget: { dataset: { id: 'reply', root: 'root', name: '小明' } } }); cp.data.draft = '回复内容'; const send = cp.send(); const sr = take('post', '/comments'); assert.equal(sr.data.replyToCommentId, 'reply'); assert.equal(sr.data.parentId, 'root'); sr.resolve(comment('new-reply', { parentId: 'root' })); await send; take('get', '/comments').resolve({ items: [comment('root', { replyCount: 3 })] }); take('get', '/comments').resolve({ items: [comment('reply', { parentId: 'root' })] }); await flush(); assert.ok(events.some((e) => e.name === 'countchange' && e.detail.delta === 1));
assert.equal(cp.data.composing, false, 'a successful reply closes the composer');
cp.data.draft = '保留草稿'; const disabledSend = cp.send(); take('post', '/comments').reject(new HttpError(409, '', { problemType: '/problems/comments-disabled' })); await disabledSend; assert.equal(cp.data.closed, true); assert.equal(cp.data.draft, '保留草稿'); assert.ok(events.some((e) => e.name === 'disabled'));
const deleting = cp.deleteConfirmed(cp.data.comments[0]); take('del', '/comments/root').resolve(undefined); await deleting; assert.ok(events.some((e) => e.name === 'countchange' && e.detail.delta === -4)); take('get', '/comments').resolve({ items: [] }); await flush(); assert.equal(cp.data.comments.length, 0);
assert.equal(cp.data.rootId, '');
cd.lifetimes.detached.call(cp);

const deletedTarget = instance(cd, { articleId: summary.id, enabled: true, totalCount: 0, focusCommentId: '' }); deletedTarget._alive = true; deletedTarget.feedback(new HttpError(404)); assert.equal(events.at(-1).name, 'changed');

// Component native policies and notification targets retain existing fallback.
load('subpkg_red/components/article-body/index.ts'); const bd = captured.pop(), bc = instance(bd, { nodes: reading.nodes }); bc.mediaError({ currentTarget: { dataset: { key: 5 } } }); assert.equal(bc.data.failed[5], true); bc.retryMedia({ currentTarget: { dataset: { key: 5 } } }); assert.equal(bc.data.failed[5], false); bc.preview({ currentTarget: { dataset: { url: image.url } } }); assert.equal(wxCalls.at(-1)[0], 'preview'); bc.link({ currentTarget: { dataset: { href: 'https://example.org/link' } } }); assert.equal(wxCalls.at(-1)[0], 'clipboard'); bd.pageLifetimes.hide.call(bc); assert.deepEqual(wxCalls.at(-1), ['pause', 'article-video-5']);
load('subpkg_red/components/article-card/index.ts'); const card = instance(captured.pop(), { article: summary }); card.open(); assert.equal(events.at(-1).detail.articleId, summary.id);
const nt = load('utils/notification-target.ts'); assert.equal(nt.resolveNotificationTarget({ type: 'ARTICLE_DETAIL', articleId: summary.id, commentId: 'root' }), api.articleRoute(summary.id) + '&commentId=root'); assert.equal(nt.resolveNotificationTarget({ type: 'FUTURE_TARGET' }), null); assert.match(nt.resolveNotificationTarget({ type: 'POST_DETAIL', postId: 'post-1' }), /postId=post-1/);

// Exercise the disabled fallback and all enabled Article content V1 branches.
const caps = load('subpkg_red/services/article-capabilities.ts').ARTICLE_CAPABILITIES;
assert.equal(caps.contentV1, false);
const gated = instance(list); gated.onLoad({ sceneCode: 'E_SAFETY' });
assert.equal(gated.data.scenePending, true); assert.equal(pending.length, 0);
caps.contentV1 = true;
const parent = { ...category, sceneCodes: ['RED_BOOK_CORNER'] };
const child = { ...category, id: 'child', parentId: category.id, sceneCodes: [] };
assert.equal(api.mapCategory(child).parentId, category.id);
assert.throws(() => api.mapCategory({ ...child, sceneCodes: ['PARTY_NEWS'] }));
for (const code of api.SCENE_CODES) {
  const scene = instance(list); scene.onLoad({ sceneCode: code });
  const c = take('get', '/v1/article-categories'), r = take('get', '/v1/articles');
  assert.equal(r.data.sceneCode, code); assert.equal(r.data.categoryId, undefined);
  c.resolve({ items: [parent, child] }); r.resolve({ items: [] }); await flush();
  assert.equal(scene.data.categories.length, code === 'RED_BOOK_CORNER' ? 2 : 0);
  assert.deepEqual(plain(scene.data.sectionOptions.map((option) => option.id)), code === 'RED_BOOK_CORNER' ? ['', child.id] : ['']);
  assert.equal(scene.data.sceneEmpty, code !== 'RED_BOOK_CORNER');
}
const rootOnly = instance(list);
rootOnly.onLoad({ sceneCode: 'RED_BOOK_CORNER', categoryId: parent.id });
take('get', '/v1/article-categories').resolve({ items: [parent] }); await flush();
const rootOnlyRead = take('get', '/v1/articles');
assert.equal(rootOnlyRead.data.includeChildren, true);
assert.deepEqual(plain(rootOnly.data.sectionOptions.map((option) => option.id)), ['']);
rootOnlyRead.resolve({ items: [] }); await flush();
const manySections = instance(list);
const children = Array.from({ length: 5 }, (_, index) => ({ ...child, id: `section-${index}` }));
manySections.onLoad({ sceneCode: 'RED_BOOK_CORNER' });
take('get', '/v1/article-categories').resolve({ items: [parent, ...children] });
take('get', '/v1/articles').resolve({ items: [] }); await flush();
assert.equal(manySections.data.sectionOptions.length, 6);
manySections.pickCategory({ detail: { value: '5' } });
const picked = take('get', '/v1/articles');
assert.equal(picked.data.categoryId, children[4].id);
assert.equal(picked.data.includeChildren, false);
picked.resolve({ items: [] }); await flush();
assert.equal(manySections.data.sectionIndex, 5);
const legacyEntry = instance(list); legacyEntry.onLoad({});
const legacyCategories = take('get', '/v1/article-categories'), legacyArticles = take('get', '/v1/articles');
assert.equal(legacyArticles.data.sceneCode, 'PARTY_NEWS');
legacyCategories.resolve({ items: [] }); legacyArticles.resolve({ items: [] }); await flush();
const filtered = instance(list); filtered.data.categoryId = ''; filtered.data.sceneCode = 'RED_BOOK_CORNER'; filtered.data.categories = [parent, child];
filtered.changeCategory({ currentTarget: { dataset: { id: parent.id } } });
const rootQuery = take('get', '/v1/articles'); assert.equal(rootQuery.data.includeChildren, true);
filtered.changeCategory({ currentTarget: { dataset: { id: child.id } } });
const childQuery = take('get', '/v1/articles'); assert.equal(childQuery.data.includeChildren, false);
childQuery.resolve({ items: [summary] }); await flush();
rootQuery.resolve({ items: [{ ...summary, id: 'old-root' }] }); await flush(); assert.equal(filtered.data.items[0].id, summary.id);
filtered.queryInput({ detail: { value: ' 学习 ' } }); filtered.search();
const searching = take('get', '/v1/articles'); assert.equal(searching.data.q, '学习'); assert.equal(searching.data.sceneCode, 'RED_BOOK_CORNER'); assert.equal(searching.data.categoryId, 'child'); assert.equal(searching.data.cursor, undefined);
filtered.queryInput({ detail: { value: '新条件' } });
assert.equal(filtered.data.q, '学习'); assert.equal(pending.length, 0);
filtered.search(); take('get', '/v1/articles').resolve({ items: [summary], nextCursor: 'expired' }); await flush();
searching.resolve({ items: [{ ...summary, id: 'old-search' }] }); await flush();
assert.equal(filtered.data.items[0].id, summary.id);
const invalidMore = filtered.more(); take('get', '/v1/articles').reject(new HttpError(400, '', { problemType: '/problems/invalid-cursor' })); await invalidMore;
const reloadCategories = take('get', '/v1/article-categories');
reloadCategories.resolve({ items: [] }); await flush();
// Lost mapping removes the old category and re-reads the scene without falling back to all-site.
const remapped = take('get', '/v1/articles'); assert.equal(remapped.data.cursor, undefined); assert.equal(remapped.data.categoryId, undefined); assert.equal(remapped.data.sceneCode, 'RED_BOOK_CORNER'); remapped.resolve({ items: [] }); await flush();
const directReader = instance(detailDef);
directReader.onLoad({ articleId: summary.id });
const childRead = directReader.load();
take('get', encodeURIComponent(summary.id)).resolve({ ...detail, category: child });
await childRead;
assert.equal(directReader.data.article.id, summary.id);
assert.equal(directReader.data.scene.title, '文章详情');
take('get', '/v1/article-categories').resolve({ items: [parent, child] });
take('get', '/like').resolve({ liked: false, likeCount: stats.likeCount });
take('get', '/favorite').resolve({ articleId: summary.id, favorited: false });
take('post', '/views').resolve(stats);
await flush();
assert.equal(directReader.data.scene.layout, 'feature');
const standaloneRead = directReader.load();
take('get', encodeURIComponent(summary.id)).resolve(detail);
await standaloneRead;
take('get', '/like').resolve({ liked: false, likeCount: stats.likeCount });
take('get', '/favorite').resolve({ articleId: summary.id, favorited: false });
assert.equal(directReader.data.scene.title, '文章详情');
directReader.onUnload();
const favorite = load('subpkg_red/services/article-favorite.ts');
const unavailableFavorite = { articleId: summary.id, favoritedAt: summary.publishedAt, availability: 'UNAVAILABLE' };
assert.deepEqual(plain(favorite.mapFavorite({ ...unavailableFavorite, article: summary })), unavailableFavorite);
assert.throws(() => favorite.mapFavorite({ ...unavailableFavorite, availability: 'AVAILABLE', article: { ...summary, id: 'wrong' } }));
for (const [desired, method] of [[true, 'put'], [false, 'del'], [false, 'del']]) {
  const operation = favorite.setFavorite(summary.id, desired); const req = take(method, '/favorite');
  assert.match(req.url, /articles\/article-A%20/); assert.equal(req.options.retryAuth, false);
  req.resolve({ articleId: summary.id, favorited: desired }); assert.equal(await operation, desired);
}
page.data.article = api.mapArticle(summary);
const read1 = page.loadFavorite(page._generation); const firstRead = take('get', '/favorite');
const read2 = page.loadFavorite(page._generation); take('get', '/favorite').resolve({ articleId: summary.id, favorited: false }); await read2;
const addFavorite = page.favorite(); const adding = take('put', '/favorite'); await page.favorite();
adding.reject(new Error('unknown outcome')); await addFavorite; assert.equal(page.data.favoriteReady, false);
firstRead.resolve({ articleId: summary.id, favorited: true }); await read1; assert.equal(page.data.favoriteReady, false);
page.retryFavorite(); take('get', '/favorite').resolve({ articleId: summary.id, favorited: true }); await flush(); assert.equal(page.data.favorited, true);
load('subpkg_red/pages/article-favorites/list.ts'); const favoritesDef = captured.pop(), favoritesPage = instance(favoritesDef);
favoritesPage.onShow(); take('get', '/v1/users/me/article-favorites').resolve({ items: [unavailableFavorite], nextCursor: 'more' }); await flush();
favoritesPage.open({ detail: { articleId: summary.id } });
assert.equal(favoritesPage.data.items[0].article, undefined);
const removing = favoritesPage.remove({ currentTarget: { dataset: { id: summary.id } } });
take('del', '/favorite').resolve({ articleId: summary.id, favorited: false }); await flush();
take('get', '/v1/users/me/article-favorites').resolve({ items: [] }); await removing; assert.equal(favoritesPage.data.items.length, 0);
const staleFavorites = favoritesPage.load(); const staleFavoriteRequest = take('get', '/v1/users/me/article-favorites'); favoritesPage.onHide(); staleFavoriteRequest.resolve({ items: [{ ...unavailableFavorite, availability: 'AVAILABLE', article: summary }] }); await staleFavorites; assert.equal(favoritesPage.data.items.length, 0);
favoritesPage.onLoad(); favoritesPage.onShow(); const priorUserRequest = take('get', '/v1/users/me/article-favorites');
identity.id = 'user-2'; for (const fn of identityWatchers) fn();
const currentUserRequest = take('get', '/v1/users/me/article-favorites');
priorUserRequest.resolve({ items: [{ ...unavailableFavorite, availability: 'AVAILABLE', article: summary }] }); await flush(); assert.equal(favoritesPage.data.items.length, 0);
currentUserRequest.resolve({ items: [unavailableFavorite] }); await flush(); assert.equal(favoritesPage.data.items[0].article, undefined);
favoritesPage.onUnload(); identity.id = 'user-1';
const filesApi = load('subpkg_red/services/article-files.ts');
assert.equal(filesApi.mapFiles(undefined), undefined); assert.deepEqual(plain(filesApi.mapFiles([])), []);
const fileWire = { attachmentId: 'file-1', kind: 'PDF', contentType: 'application/pdf', name: '文档.pdf', sizeBytes: 1024, url: 'https://example.org/provider-resource' };
assert.equal(filesApi.mapFiles([{ ...fileWire, sizeBytes: '1024' }])[0].sizeBytes, 1024);
for (const sizeBytes of ['0', '10485761', '1e3', '9007199254740993']) {
  assert.throws(() => filesApi.mapFiles([{ ...fileWire, sizeBytes }]), /文件类型或大小不正确/);
}
for (const [kind, contentType, expected] of [['PDF', 'application/pdf', 'pdf'], ['WORD', 'application/msword', 'doc'], ['WORD', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx']]) assert.equal(filesApi.mapFiles([{ ...fileWire, kind, contentType }])[0].fileType, expected);
assert.throws(() => filesApi.mapFiles([{ ...fileWire, kind: 'IMAGE' }])); assert.throws(() => filesApi.mapFiles([{ ...fileWire, sizeBytes: 0 }]));
assert.throws(() => filesApi.mapSource({ name: '来源', url: 'javascript:bad' })); assert.equal(filesApi.mapSource({ name: '来源' }).name, '来源');
let downloading, opening; wx.canIUse = () => true;
wx.downloadFile = (r) => { downloading = r; return { abort() {} }; }; wx.openDocument = (r) => { opening = r; };
load('subpkg_red/components/article-files/index.ts'); const filesDef = captured.pop(), fileComponent = instance(filesDef, { files: filesApi.mapFiles([fileWire]) }); filesDef.lifetimes.attached.call(fileComponent);
const openFile = () => fileComponent.open({ currentTarget: { dataset: { id: 'file-1' } } });
const failedDownload = openFile(); assert.equal(downloading.url, fileWire.url); downloading.success({ statusCode: 404, tempFilePath: 'bad' }); await failedDownload; assert.equal(opening, undefined); assert.match(fileComponent.data.error, /下载失败/);
const failedOpen = openFile(); downloading.success({ statusCode: 200, tempFilePath: 'temporary' }); await flush(); assert.equal(opening.fileType, 'pdf'); opening.fail(); await failedOpen; assert.match(fileComponent.data.error, /无法打开/);
const successfulOpen = openFile(); downloading.success({ statusCode: 200, tempFilePath: 'temporary' }); await flush(); opening.success(); await successfulOpen; assert.equal(fileComponent.data.error, '');
opening = undefined; const hiddenDownload = openFile(); filesDef.pageLifetimes.hide.call(fileComponent); downloading.success({ statusCode: 200, tempFilePath: 'late' }); await hiddenDownload; assert.equal(opening, undefined);
caps.contentV1 = true;
assert.equal(pending.length, 0);
console.log('PASS Article content V1: six scenes, hierarchy/AND search, late response and cursor/mapping recovery, Provider gate, favorite state/unknown outcome/unavailable cancellation, MIME files and download/open/hide failure policies (test doubles).');

// Exercise the existing LearningTask seam without running its unrelated assignment state machine.
for (const relative of ['subpkg_user/services/learning-task.ts', 'subpkg_user/services/learning-task-state.ts', 'subpkg_user/services/learning-task-operation.ts', 'services/person-binding.ts']) mocks.set(path.join(root, relative), { runLearningOperation() { throw new Error('Reading must never submit learning completion'); } });
load('subpkg_user/pages/learning-task-detail/detail.ts'); const taskPage = instance(captured.pop());
let taskReads = 0; taskPage.load = async () => { ++taskReads; };
taskPage.data.detail = { task: { article: { articleId: summary.id, availability: 'AVAILABLE' } } };
const beforeNavigation = wxCalls.length; taskPage.openArticle(); assert.equal(wxCalls.length, beforeNavigation + 1); assert.equal(wxCalls.at(-1)[1].url, api.articleRoute(summary.id));
taskPage.onShow(); await flush(); assert.equal(taskReads, 1);
taskPage.data.detail.task.article.availability = 'UNAVAILABLE'; taskPage.openArticle(); assert.equal(wxCalls.length, beforeNavigation + 1); assert.equal(pending.length, 0);
const homeTemplate = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
const homePage = fs.readFileSync(path.join(root, 'pages/index/index.ts'), 'utf8');
assert.match(homeTemplate, /wx:for="{{quickNav}}"[^>]*url="{{item.url}}"/);
for (const code of api.SCENE_CODES) assert.ok(homePage.includes('article-list/list?sceneCode=' + code));
assert.match(homeTemplate, /content-list\/list\?category=E_SAFETY/);
assert.match(fs.readFileSync(path.join(root, 'subpkg_red/pages/article-list/list.wxml'), 'utf8'), /历史官方内容/);
console.log('PASS learning Article seam: AVAILABLE-only route, return onShow re-read, no completion write; six home routes and E-safety legacy link retained. Task reader is mocked.');

// Actual legacy Post/Interact modules still consume the original model and POST target.
const postWire = { id: 'post-1', postType: 'NORMAL', author: { id: 'user-1', nickname: '普通用户', avatarUrl: '' }, content: '普通图文帖子', attachments: [{ url: image.url }], publishedAt: summary.publishedAt, liked: true, likeCount: 2, commentCount: 3, viewCount: 4 };
const legacyCalls = [];
mocks.set(path.join(root, 'services/api.ts'), { api: { post: { getList: async (q) => { legacyCalls.push(['list', q]); return { list: [postWire], hasMore: false }; }, getDetail: async (id) => { legacyCalls.push(['detail', id]); return postWire; }, create: async (data) => { legacyCalls.push(['create', data]); return { ...postWire, content: data.content }; } }, interact: { like: async (data) => legacyCalls.push(['like', data]), unlike: async (data) => legacyCalls.push(['unlike', data]) } } });
mocks.set(path.join(root, 'utils/logger.ts'), { createLogger: () => ({ info() {}, error() {}, warn() {} }) });
const post = load('services/post.ts');
const postPage = await post.fetchPostList({ pageSize: 20 }); assert.equal(postPage.list[0].content, postWire.content); assert.deepEqual(plain(postPage.list[0].images), [image.url]); assert.equal((await post.getPostDetail('post-1')).id, 'post-1');
assert.equal((await post.publishPost({ content: ' 普通帖子 ', attachmentItems: [] })).content, '普通帖子'); await assert.rejects(() => post.publishPost({ content: '  ' }));
const legacyInteract = load('services/interact.ts'); await legacyInteract.togglePostLike('post-1', true); await legacyInteract.togglePostLike('post-1', false); const { TARGET_TYPES } = load('utils/constants.ts'); assert.equal(legacyCalls.at(-1)[1].targetType, TARGET_TYPES.POST.value); assert.equal(legacyCalls.at(-1)[1].targetType, 'POST');

const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')); const red = config.subPackages.find((p) => p.root === 'subpkg_red'); for (const route of ['pages/article-list/list', 'pages/article-detail/detail', 'pages/content-list/list', 'pages/content-detail/detail']) assert.ok(red.pages.includes(route));
for (const file of ['subpkg_red/components/article-card/index.wxml', 'subpkg_red/pages/article-detail/detail.wxml']) {
  const template = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(template, /\{\{article\.publisherDisplayName\}\}/);
  assert.doesNotMatch(template, /article\.publisher\.displayName/);
}
assert.equal(pending.length, 0);
console.log('PASS Article: organization/legacy publisher dual read, snapshot priority/malformed data/canonical examples, list/detail display, canonical API, seven body nodes/security, pagination races/retry, detail/like/view/share, closed comments/replies/delete, native media policies, notification and old routes. wx/HTTP are test doubles; no runtime/device proof.');
