// Deterministic consumer tests. HTTP, storage and wx are substitutes, not runtime acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const cache = new Map(),
  mocks = new Map(),
  calls = [],
  notices = [];
let definition,
  owner = 'a',
  token = 'token-a',
  listeners = [],
  savedKeys = [],
  storageWorks = true;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
const plain = (x) => JSON.parse(JSON.stringify(x));
const mock = (name, value) => mocks.set(path.resolve(root, name), value);
function load(name) {
  const file = path.resolve(root, name);
  if (mocks.has(file)) return mocks.get(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: false,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      wx: {
        navigateTo: (x) => calls.push(x),
        setNavigationBarTitle() {},
        showLoading() {},
        hideLoading() {},
        nextTick: (f) => f(),
        showModal: async () => ({ confirm: true }),
        stopPullDownRefresh() {},
      },
      Page: (x) => {
        definition = x;
      },
      Component: (x) => {
        definition = x;
      },
      setTimeout,
      clearTimeout,
      require: (id) => load(path.resolve(path.dirname(file), id + '.ts')),
    },
    { filename: file },
  );
  return exports;
}
function instance() {
  return {
    ...definition,
    ...definition.methods,
    data: plain(definition.data),
    properties: Object.fromEntries(
      Object.entries(definition.properties ?? {}).map(([key, p]) => [key, p.value]),
    ),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        const last = parts.pop();
        parts.reduce((x, p) => x[p], this.data)[last] = value;
      }
    },
    triggerEvent: (name, data) => calls.push({ name, data }),
  };
}
mock('utils/logger.ts', { createLogger: () => ({ warn() {}, error() {}, info() {} }) });
mock('stores/helper.ts', { getUserId: () => owner });
mock('utils/storage.ts', {
  STORAGE_KEYS: { TOKEN: 'token', POST_CREATION_KEYS: 'keys' },
  storage: {
    get: (key) => (key === 'token' ? token : savedKeys),
    set: (key, value) => {
      if (storageWorks) savedKeys = plain(value);
      return storageWorks;
    },
  },
});
mock('actions/current-user.ts', {
  getCurrentIdentity: () => ({ id: owner, nickname: '本人' }),
  peekCurrentProfile: () => undefined,
  watchCurrentIdentity: (fn) => {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((x) => x !== fn);
    };
  },
});
mock('utils/notify.ts', {
  getErrorMessage: (e, f) => e.userMessage ?? e.message ?? f,
  showErrorToast: (e) => notices.push(e.message),
  notifyToast: (x) => notices.push(x.title),
});
const http = Object.fromEntries(
  ['get', 'post', 'put', 'del'].map((method) => [
    method,
    async (url, data, options) => {
      calls.push({ method, url, data, options });
      return {};
    },
  ]),
);
mock('utils/request.ts', { http });
const flags = load('config/post-capabilities.ts').POST_CAPABILITIES;
assert.equal(flags.communityV1, true);
assert.equal(flags.organization, true);
assert.equal(flags.mentorQa, true);
assert.equal(flags.mentorAnswers, true);
assert.equal(flags.legacyNormalProvider, false);
// Explicitly exercise the retained disabled/legacy compatibility branch.
Object.assign(flags, {
  communityV1: false,
  organization: false,
  mentorQa: false,
  mentorAnswers: false,
  legacyNormalProvider: true,
});
const { community } = load('services/post-community.ts');
await load('services/api.ts').api.report.create({
  targetType: 'POST',
  targetId: 'p',
  reason: 'OTHER',
  remark: 'private',
});
assert.equal(calls.at(-1).options.sensitive, true);
assert.equal(calls.at(-1).options.retryAuth, false);
await community.roots('p', 'root-20');
assert.equal(calls.at(-1).data.representation, 'thread');
assert.equal(calls.at(-1).data.lastId, 'root-20');
await community.replies('p', 'root', 'reply-20');
assert.equal(calls.at(-1).data.parentId, 'root');
assert.equal(calls.at(-1).data.representation, 'thread');
await community.context('p', 'a/b');
assert.equal(calls.at(-1).url, '/v1/comment/a%2Fb/context');
await community.createPost({ content: '内容' }, 'same-key');
assert.equal(calls.at(-1).options.preserveEnvelope, true);
assert.equal(calls.at(-1).options.headers['Idempotency-Key'], 'same-key');
assert.equal(calls.at(-1).options.retryAuth, false);
await community.reports('last-report');
assert.equal(calls.at(-1).data.lastId, 'last-report');
await community.favorites('opaque');
assert.equal(calls.at(-1).data.cursor, 'opaque');
await community.clearHistory();
assert.equal(calls.at(-1).method, 'del');
const creation = load('actions/post-creation.ts'),
  errors = load('utils/error.ts');
await assert.rejects(creation.createCommunityPost({ content: 'draft' }), /尚未开放/);
flags.communityV1 = true;
let attempts = 0,
  receiptKey;
community.createPost = async () => {
  attempts++;
  throw new errors.NetworkError('timeout');
};
await assert.rejects(creation.createCommunityPost({ content: 'draft' }));
assert.equal(savedKeys.length, 1);
const originalKey = savedKeys[0].key;
await assert.rejects(creation.createCommunityPost({ content: 'new draft' }), /先核对/);
assert.equal(attempts, 1);
community.postReceipt = async (key) => {
  receiptKey = key;
  throw new errors.HttpError(404);
};
await assert.rejects(creation.recoverPostCreation('post'));
assert.equal(savedKeys[0].key, originalKey);
owner = 'b';
token = 'token-b';
assert.equal(creation.pendingPostCreation('post'), undefined);
owner = 'a';
token = 'token-a';
community.postReceipt = async (key) => {
  receiptKey = key;
  return { id: 'accepted' };
};
assert.equal((await creation.recoverPostCreation('post')).id, 'accepted');
assert.equal(receiptKey, originalKey);
assert.equal(savedKeys.length, 0);
storageWorks = false;
await assert.rejects(creation.createCommunityPost({ content: 'draft' }), /无法保存/);
assert.equal(attempts, 1);
storageWorks = true;
community.createPost = async () => {
  attempts++;
  throw new errors.HttpError(422);
};
await assert.rejects(creation.createCommunityPost({ content: 'rejected' }));
assert.equal(savedKeys.length, 0);
const inFlight = deferred();
community.createPost = () => {
  attempts++;
  return inFlight.promise;
};
const first = creation.createCommunityPost({ content: 'first' });
await assert.rejects(creation.createCommunityPost({ content: 'first' }), /重复点击/);
owner = 'b';
token = 'token-b';
inFlight.resolve({ submission: { id: 'accepted-a' } });
await assert.rejects(first, /账号已变化/);
assert.equal(savedKeys[0].owner, 'a');
owner = 'a';
token = 'token-a';
await creation.recoverPostCreation('post');

// Thread placeholders must discard even malicious extra body/author/image fields.
mock('services/api.ts', { api: { post: { getDetail: async () => ({ commentCount: 7 }) } } });
mock('utils/time-util.ts', { formatTime: (x) => x, TimeStyle: { POST: 1 } });
mock('utils/avatar.ts', { getAvatarInfo: () => ({ bg: '', char: '' }) });
const comments = load('services/comment.ts');
const permission = { state: 'ALLOWED', reason: 'NONE' };
const reply = {
  id: 'reply',
  parentId: 'root',
  content: '合法回复',
  author: { id: 'b', nickname: '乙' },
  createdAt: 'now',
  likeCount: 0,
  liked: false,
  replyPermission: permission,
};
const rootWire = {
  id: 'root',
  state: 'AUTHOR_DELETED',
  createdAt: 'now',
  replyCount: 1,
  previewReplies: [reply],
  replyPermission: permission,
  content: 'secret',
  author: { id: 'original' },
  imageUrl: 'private',
};
assert.throws(() => comments.mapThreadRoot({ ...rootWire, state: 'FUTURE' }), /线程表示/);
const placeholder = comments.mapThreadRoot(rootWire);
assert.equal(placeholder.content, '');
assert.equal(placeholder.userId, '');
assert.equal(placeholder.imageUrl, '');
assert.equal(placeholder.likeCount, 0);
assert.equal(placeholder.replyPreview[0].content, '合法回复');
assert.equal(placeholder.replyPreview[0].replyToName, '');

// Actual personal Page pagination: >20, duplicate, sparse empty page, errors, races and logout.
load('subpkg_community/pages/my-community/list.ts');
const list = instance();
list.onLoad({ kind: 'posts' });
const post = (id) => ({
  post: { id, postType: 'NORMAL', content: '', attachments: [{ url: 'image' }] },
  submission: {
    id,
    lifecycle: {
      acceptedAt: 'now',
      submissionVersion: 'v',
      effectiveVersion: null,
      visibility: 'PRIVATE',
      safety: 'CHECKING',
      authorDeleted: false,
      adminHidden: false,
    },
    availableActions: ['VIEW'],
  },
});
const pages = [];
community.myPosts = (cursor) => {
  const d = deferred();
  pages.push({ cursor, ...d });
  return d.promise;
};
let task = list.load(true);
pages[0].resolve({
  items: Array.from({ length: 20 }, (_, i) => post(String(i))),
  hasMore: true,
  nextCursor: 'page2',
});
await task;
assert.equal(list.data.rows.length, 20);
assert.match(list.data.rows[0].status, /尚未公开/);
task = list.load(false);
assert.equal(pages[1].cursor, 'page2');
pages[1].resolve({ items: [], hasMore: true, nextCursor: 'page3' });
await task;
assert.equal(list.data.rows.length, 20);
assert.equal(list.data.hasMore, true);
task = list.load(false);
pages[2].reject(new errors.NetworkError('offline'));
await task;
assert.equal(list.data.rows.length, 20);
assert.equal(list.data.cursor, 'page3');
task = list.load(false);
pages[3].resolve({ items: [post('19'), post('20')], hasMore: false });
await task;
assert.equal(list.data.rows.length, 21);
const old = list.load(true),
  latest = list.load(true);
pages[5].resolve({ items: [post('latest')], hasMore: false });
await latest;
pages[4].resolve({ items: [post('old')], hasMore: false });
await old;
assert.equal(list.data.rows[0].id, 'latest');
task = list.load(true);
owner = 'b';
token = 'token-b';
listeners.forEach((fn) => fn());
assert.equal(list.data.rows.length, 0);
pages[6].resolve({ items: [post('private-a')], hasMore: false });
await task;
assert.equal(list.data.rows.length, 0);
pages[7].resolve({ items: [], hasMore: false });
await tick();
list.onUnload();
owner = 'a';
token = 'token-a';
load('subpkg_community/pages/my-community/list.ts');
const favorites = instance();
favorites.onLoad({ kind: 'favorites' });
community.favorites = async () => ({
  items: [
    {
      postId: 'removed',
      availability: 'UNAVAILABLE',
      post: { content: 'SECRET', attachments: [{ url: 'SECRET' }], postType: 'NORMAL' },
    },
  ],
  hasMore: false,
});
await favorites.load(true);
assert.equal(favorites.data.rows[0].image, '');
assert.equal(favorites.data.rows[0].available, false);
assert.doesNotMatch(favorites.data.rows[0].text, /SECRET/);
community.setFavorite = async () => ({ favorited: false });
await favorites.removeFavorite({ currentTarget: { dataset: { id: 'removed' } } });
assert.equal(favorites.data.removingId, '');
const pendingFavorites = deferred();
community.favorites = () => pendingFavorites.promise;
const oldFavorites = favorites.load(true);
favorites.onRecordKind({ currentTarget: { dataset: { kind: 'posts' } } });
assert.equal(favorites.data.kind, 'posts');
assert.deepEqual(Array.from(favorites.data.rows), []);
pages.at(-1).resolve({ items: [post('new-kind')], hasMore: false });
await tick();
pendingFavorites.resolve({ items: [], hasMore: false });
await oldFavorites;
assert.equal(favorites.data.rows[0].id, 'new-kind');
favorites.onUnload();

// Context uses one lookup and merges focus+continuation without scanning all root pages.
mock('utils/defineComponent.ts', {
  default: () => (x) => {
    definition = x;
  },
});
mock('behaviors/sheet-mixin.ts', { useSheet: () => ({}) });
mock('utils/wx-promise.ts', { wxShowModal: async () => ({ confirm: true }) });
mock('services/person-binding.ts', {
  watchPersonBinding: () => () => {},
  personBindingEpoch: () => 0,
});
mock('actions/media.ts', {});
let rootReads = 0,
  contextReads = 0,
  countReads = 0;
community.context = async () => {
  contextReads++;
  return {
    postId: 'p',
    availability: 'AVAILABLE',
    root: rootWire,
    focus: reply,
    nextReplyCursor: 'reply-next',
  };
};
mock('actions/comment.ts', {
  getCommentList: async () => {
    rootReads++;
    return { list: [], hasMore: true, nextCursor: 'root-next' };
  },
  syncCommentAuthor: (x) => x,
  removeComment: async () => {},
});
load('components/comment-panel/index.ts');
const panel = instance();
Object.assign(panel.properties, {
  targetId: 'p',
  targetType: 'POST',
  postType: 'NORMAL',
  focusCommentId: 'reply',
  commentPermission: permission,
});
panel._requestGeneration = 0;
await panel._loadComments(true);
assert.equal(rootReads, 1);
assert.equal(contextReads, 1);
assert.equal(panel.data.commentList[0].placeholder, true);
assert.equal(panel.data.commentList[0].replyList.length, 1);
assert.equal(panel.data.commentList[0].lastId, 'reply-next');
panel.onReplyTap({
  currentTarget: { dataset: { commentId: 'root', replyToCommentId: 'root', nickName: 'secret' } },
});
assert.equal(panel.data.replyTarget.nickName, undefined);
panel.onReplyTap({
  currentTarget: {
    dataset: { commentId: 'root', replyToCommentId: 'reply', nickName: '乙', userId: 'b' },
  },
});
assert.equal(panel.data.replyTarget.replyToCommentId, 'reply');
community.context = async () => ({ postId: 'p', availability: 'UNAVAILABLE' });
await panel._loadComments(true);
assert.match(panel.data.contextNotice, /目标评论已不可用/);
assert.equal(panel.data.commentList.length, 0);
// Local comments and counts appear immediately, independently of public visibility.
mock('actions/post-creation.ts', {
  pendingPostCreation: () => undefined,
  createCommunityComment: async () => ({ id: 'private-comment' }),
});
// Re-evaluate Component so its application boundary is substituted.
cache.delete(path.resolve(root, 'components/comment-panel/index.ts'));
load('components/comment-panel/index.ts');
const sendPanel = instance();
Object.assign(sendPanel.properties, {
  targetId: 'p',
  targetType: 'POST',
  postType: 'NORMAL',
  commentPermission: permission,
});
sendPanel._requestGeneration = 0;
sendPanel._selectedFiles = [];
sendPanel._draftValue = '新评论';
sendPanel.data.canSend = true;
sendPanel.data.currentTotalCount = 7;
sendPanel._loadComments = async () => {};
sendPanel._refreshPublicCount = async () => {
  countReads++;
};
await sendPanel.onSend();
assert.equal(sendPanel.data.commentList.length, 1);
assert.equal(sendPanel.data.currentTotalCount, 8);
assert.equal(sendPanel.data.submittedCommentId, '');
assert.equal(sendPanel.data.submissionNotice, '');
assert.equal(sendPanel._draftValue, '');
assert.equal(countReads, 0);

// A stale count read cannot undo a new local comment. Public acknowledgement
// consumes its local credit once, and a failed submission restores the count.
const readCount = definition.methods._refreshPublicCount;
const detailApi = mocks.get(path.resolve(root, 'services/api.ts')).api.post;
const communityApi = load('services/post-community.ts').community;
communityApi.myComment = async (id) => ({ submission: { id, postId: 'p', visibility: 'PRIVATE', safety: 'CHECKING' } });
await readCount.call(sendPanel);
assert.equal(sendPanel.data.currentTotalCount, 8);
communityApi.myComment = async (id) => ({ submission: { id, postId: 'p', visibility: 'PUBLIC', safety: 'PASSED' } });
detailApi.getDetail = async () => ({ commentCount: 8 });
await readCount.call(sendPanel);
assert.equal(sendPanel.data.currentTotalCount, 8, 'publication must not count the same ID twice');
const staleCount = deferred();
detailApi.getDetail = () => staleCount.promise;
const oldRead = readCount.call(sendPanel);
await tick();
sendPanel._insertLocalComment('local-new', '第二条', '', {});
assert.equal(sendPanel.data.currentTotalCount, 9);
staleCount.resolve({ commentCount: 7 });
await oldRead;
assert.equal(sendPanel.data.currentTotalCount, 9, 'pre-mutation reads are discarded');
sendPanel._removeLocalPreview('local-new');
assert.equal(sendPanel.data.currentTotalCount, 8);
const pendingSend = deferred();
mocks.get(path.resolve(root, 'actions/post-creation.ts')).createCommunityComment = () => pendingSend.promise;
sendPanel._draftValue = '失败后保留';
sendPanel.data.canSend = true;
const failedSend = sendPanel.onSend();
assert.equal(sendPanel.data.currentTotalCount, 9, 'count changes before the POST resolves');
assert.equal(sendPanel.data.commentList[0].content, '失败后保留');
pendingSend.reject(new Error('offline'));
await failedSend;
assert.equal(sendPanel.data.currentTotalCount, 8);
assert.equal(sendPanel._draftValue, '失败后保留');
assert.equal(sendPanel.data.submissionNotice, '');
detailApi.getDetail = async () => ({ commentCount: 7 });

const labels = load('utils/post-community.ts');
assert.match(
  labels.lifecycleLabel({ ...post('p').submission.lifecycle, visibility: 'FUTURE' }),
  /未识别/,
);
assert.equal(
  labels.commentLabel({ visibility: 'PUBLIC', safety: 'FUTURE' }),
  '状态暂未识别，请刷新查看',
);
mock('utils/routes.ts', { buildPostDetailRoute: (id) => '/post?postId=' + id });
const router = load('utils/notification-target.ts');
assert.match(
  router.resolveNotificationTarget({ type: 'MY_POST_DETAIL', postId: 'a/b' }),
  /kind=post&id=a%2Fb/,
);
assert.match(
  router.resolveNotificationTarget({ type: 'MY_POST_COMMENT_DETAIL', commentId: 'c' }),
  /kind=comment/,
);
assert.match(
  router.resolveNotificationTarget({ type: 'MY_REPORT_DETAIL', reportId: 'r' }),
  /kind=report/,
);
assert.equal(router.resolveNotificationTarget({ type: 'FUTURE' }), null);
// Root deletion re-reads the thread/count instead of deleting all retained replies.
const deletePanel = instance();
Object.assign(deletePanel.properties, { targetId: 'p', targetType: 'POST', postType: 'NORMAL' });
deletePanel._requestGeneration = 0;
deletePanel.data.currentTotalCount = 7;
deletePanel.data._menu = { type: 'comment', commentId: 'root', replyId: '' };
deletePanel.onMenuClose = () => {};
let refreshed = 0;
deletePanel._loadComments = async () => {
  refreshed++;
  deletePanel.setData({ commentList: [placeholder] });
};
deletePanel._refreshPublicCount = async () => deletePanel.setData({ currentTotalCount: 6 });
await deletePanel.onMenuDelete();
assert.equal(refreshed, 1);
assert.equal(deletePanel.data.commentList[0].replyCount, 1);
assert.equal(deletePanel.data.currentTotalCount, 6);
// Pure-image editing accepts the synthesized content; 412 preserves image draft + ETag.
let editPatch;
mock('services/post.ts', {
  getEditablePost: async () => ({
    post: {
      id: 'p',
      postType: 'NORMAL',
      content: 'server',
      title: null,
      attachmentItems: [],
      topicIds: [],
      categoryId: null,
    },
    etag: '"new"',
  }),
  editPost: async (id, patch) => {
    editPatch = patch;
    throw new errors.HttpError(412);
  },
});
load('subpkg_community/pages/post-edit/post-edit.ts');
const editor = instance();
editor.data.postId = 'p';
editor.data.images = ['image'];
editor._base = {
  id: 'p',
  postType: 'NORMAL',
  content: 'old',
  title: null,
  attachmentItems: [{ type: 'IMAGE', url: 'image' }],
  topicIds: [],
  categoryId: null,
};
editor._etag = '"old"';
editor.onContentInput({ detail: { value: '' } });
assert.equal(editor.data.canSubmit, true);
await editor.onSubmit();
assert.equal(editPatch.content, '');
assert.equal(editor.data.images[0], 'image');
assert.equal(editor._etag, '"old"');
assert.equal(editor.data.conflict, true);
editor.onRemoveImage({ currentTarget: { dataset: { index: 0 } } });
assert.equal(editor.data.canSubmit, false);

// Report submit is single-flight; duplicate/unknown results link to own records.
let reportWrites = 0,
  reportTask = deferred();
mock('actions/report.ts', {
  submitReport: () => {
    reportWrites++;
    return reportTask.promise;
  },
});
load('components/report-panel/index.ts');
const reportPanel = instance();
definition.lifetimes.attached.call(reportPanel);
Object.assign(reportPanel.properties, { targetId: 'p', targetType: 'POST', submitting: false });
reportPanel.data.selectedReason = 'OTHER';
reportPanel.data.remark = '仅本人草稿';
const reporting = reportPanel.onSubmit();
await reportPanel.onSubmit();
assert.equal(reportWrites, 1);
assert.equal(reportPanel.data.submittingLocal, true);
reportTask.reject(
  new errors.HttpError(409, 'duplicate', { problemType: '/problems/report-duplicate' }),
);
await reporting;
assert.match(reportPanel.data.resultNotice, /我的举报/);
assert.equal(reportPanel.data.unknownResult, true);
assert.equal(reportPanel.data.canSubmit, false);
owner = 'b';
token = 'token-b';
listeners.forEach((fn) => fn());
assert.equal(reportPanel.data.remark, '');
assert.equal(reportPanel.data.resultNotice, '');
assert.equal(reportPanel.data.unknownResult, false);
definition.lifetimes.detached.call(reportPanel);
owner = 'a';
token = 'token-a';

// Definitive authentication failure is not an unknown accepted mutation.
community.createPost = async () => {
  throw new errors.AuthError();
};
await assert.rejects(creation.createCommunityPost({ content: 'auth rejected' }));
assert.equal(savedKeys.length, 0);
// Pure-image create is valid; private acceptance never enters the public POST_CREATED stream.
mock('actions/post-creation.ts', creation);
mock('services/post.ts', { getPostDetail: async () => ({ viewCount: 9 }) });
let published = 0;
mock('events/post-event.ts', { emitPostCreated: () => published++, emitPostUpdated: (x) => x });
mock('stores/postSyncStore.ts', { postSyncStore: { get: () => ({ commentCount: 2 }), set() {} } });
mock('services/interact.ts', { reportView: async () => {} });
cache.delete(path.resolve(root, 'actions/post.ts'));
const postActions = load('actions/post.ts');
assert.equal(postActions.mergePostSyncCache({ id: 'p', commentCount: 7 }).commentCount, 7);
community.createPost = async () => ({ submission: { id: 'image-only' } });
await assert.rejects(
  postActions.publishPostAndSync({ title: 'title alone', content: '', attachmentItems: [] }),
  /正文或添加图片/,
);
assert.equal(
  (
    await postActions.publishPostAndSync({
      content: '',
      attachmentItems: [{ type: 'IMAGE', url: 'image' }],
    })
  ).id,
  'image-only',
);
assert.equal(published, 0);
assert.match(
  labels.lifecycleLabel({
    ...post('p').submission.lifecycle,
    visibility: 'PUBLIC',
    effectiveVersion: 'old-safe',
  }),
  /先前版本仍公开/,
);

// Shared transport must retain sibling submission only for the opted-in domain.
let responseBody = { code: 200, data: 'id', submission: { id: 'id', visibility: 'PRIVATE' } };
let transports = 0;
const transportExports = {};
const transportDeps = {
  '../config/index': { default: { baseURL: 'https://test.invalid', timeout: 1000 } },
  './logger': { createLogger: () => ({ info() {} }) },
  './error': errors,
  './wx-promise': {},
  './transfer': {},
  './stream': {},
  './auth-transport': { getAuthToken: async () => token },
};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(root, 'utils/request.ts'), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: false,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  {
    exports: transportExports,
    require: (id) => transportDeps[id],
    wx: {
      request: (opts) => {
        transports++;
        opts.success({ statusCode: 200, data: responseBody, header: {} });
      },
    },
  },
);
assert.equal(await transportExports.http.post('/v1/post', {}, { sensitive: true }), 'id');
assert.equal(
  (await transportExports.http.post('/v1/post', {}, { sensitive: true, preserveEnvelope: true }))
    .submission.visibility,
  'PRIVATE',
);
assert.equal(transports, 2);

// Opening a share menu is not an observed share; actual callbacks carry action + eventId.
mock('config/index.ts', { default: { defaultShareImageUrl: 'cover' } });
mock('utils/defineBehavior.ts', { default: () => (x) => x });
const shareDefinition = load('behaviors/useSharePoster.ts').useSharePoster();
const share = {
  ...shareDefinition.methods,
  data: plain(shareDefinition.data),
  setData(p) {
    Object.assign(this.data, p);
  },
  _shareTask: null,
  _shareRequest: null,
};
const beforeShares = calls.length;
share._prepareShare({ key: 'post', postId: 'p', path: '/post', render: async () => '' });
assert.equal(calls.length, beforeShares);
share._getShareContent();
assert.equal(calls.at(-1).data.action, 'WECHAT_SHARE_INVOKED');
const eventId = calls.at(-1).data.eventId;
assert.ok(eventId);
share.onPosterSaved();
assert.equal(calls.at(-1).data.action, 'POSTER_SAVED');
assert.notEqual(calls.at(-1).data.eventId, eventId);
flags.communityV1 = false;
assert.equal(sendPanel._usesPostThread(), false);
const disabledShares = calls.length;
share._getShareContent();
assert.equal(calls.length, disabledShares);
console.log(
  'PASS Post community: protocol requests, creation receipt/unknown/duplicate/account isolation, placeholder privacy/reply continuity, 21+ and sparse pagination/races, invalid saved targets, direct context and pending-comment counts, notification fallback. VM/HTTP substitutes only.',
);
