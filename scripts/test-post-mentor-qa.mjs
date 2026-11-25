// Deterministic boundary/Page/Component simulation; no WeChat runtime or backend proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const cache = new Map(), mocks = new Map(), calls = [], toasts = [];
let definition;
const wx = { nextTick: (fn) => fn(), showLoading() {}, hideLoading() {}, stopPullDownRefresh() {}, navigateTo: (x) => calls.push(x) };
const absolute = (file) => path.resolve(root, file);
function load(file) {
  file = absolute(file);
  if (mocks.has(file)) return mocks.get(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, {
    exports, wx, Page: (x) => { definition = x; }, Component: (x) => { definition = x; },
    setTimeout: () => 1, clearTimeout() {}, getCurrentPages: () => [],
    require: (id) => load(path.resolve(path.dirname(file), id + '.ts')),
  }, { filename: file });
  return exports;
}
const mock = (file, value) => mocks.set(absolute(file), value);
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function instance(def = definition) {
  const obj = { ...def, ...def.methods, data: plain(def.data), properties: Object.fromEntries(Object.entries(def.properties ?? {}).map(([key, value]) => [key, value.value])),
    setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        const last = parts.pop();
        parts.reduce((x, part) => x[part], this.data)[last] = value;
      }
    },
    triggerEvent: (name, detail) => calls.push({ name, detail }),
    getOpenerEventChannel: () => ({ emit: (name) => calls.push({ name }) }),
  };
  return obj;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
mock('utils/notify.ts', { notifyToast: (x) => toasts.push(x.title), showInfoToast: (x) => toasts.push(x), showSuccessToast: (x) => toasts.push(x), showErrorToast: (error) => toasts.push(error.userMessage ?? error.message) });
mock('utils/logger.ts', { createLogger: () => ({ error() {}, info() {}, warn() {} }) });
mock('utils/time-util.ts', { formatTime: (x) => x, TimeStyle: { POST: 'POST' } });
mock('utils/avatar.ts', { getAvatarInfo: () => ({ bg: '', char: '' }) });
mock('utils/wx-promise.ts', { wxGetWindowInfo: () => ({ screenHeight: 800, windowHeight: 800, safeArea: { bottom: 800 } }), wxOffKeyboardHeightChange() {}, wxOnKeyboardHeightChange() {}, wxNavigateTo: (x) => calls.push(x) });
mock('utils/defineComponent.ts', { default: () => (x) => { definition = x; } });
mock('behaviors/sheet-mixin.ts', { useSheet: () => ({}) });
mock('actions/current-user.ts', { getCurrentIdentity: () => ({ id: 'author', nickname: '我' }), watchCurrentIdentity: () => () => {} });
mock('actions/media.ts', { uploadFilesToCos: async () => [] });
mock('config/index.ts', { default: { baseURL: '', timeout: 1000 } });
const flags = load('config/post-capabilities.ts').POST_CAPABILITIES;
const policy = load('utils/post-policy.ts');
assert.equal(flags.communityV1, true);
assert.equal(flags.organization, true);
assert.equal(flags.mentorQa, true);
assert.equal(flags.mentorAnswers, true);
assert.equal(flags.legacyNormalProvider, false);
assert.equal(policy.resolvePostType(undefined), 'UNKNOWN');
// Explicit legacy fixture; shipping defaults above must remain enabled.
Object.assign(flags, { communityV1: false, organization: false, mentorQa: false, mentorAnswers: false, legacyNormalProvider: true });
assert.equal(policy.resolvePostType(undefined), 'NORMAL');
assert.equal(policy.resolvePostType('FUTURE'), 'FUTURE');
flags.legacyNormalProvider = false;
assert.equal(policy.resolvePostType(undefined), 'UNKNOWN');
assert.equal(policy.postWriteFeedback('NORMAL'), '');
assert.equal(policy.postWriteFeedback('NORMAL', { state: 'DENIED', reason: 'MENTOR_REQUIRED' }), '');
flags.legacyNormalProvider = true;
assert.equal(policy.postWriteFeedback('NORMAL'), '');
for (const bad of ['W/"a"', '*', '"a","b"', 'a', '""']) assert.throws(() => policy.assertStrongEtag(bad));
assert.equal(policy.assertStrongEtag('"revision-1"'), '"revision-1"');
assert.throws(() => policy.validateTopicIds(['a', 'a']));
assert.throws(() => policy.validateTopicIds(['a', 'b', 'c', 'd']));
assert.equal(policy.readPostPermission({ state: 'ALLOWED', reason: 'MENTOR_REQUIRED' }), undefined);
flags.organization = flags.mentorQa = true;
const allowed = { state: 'ALLOWED', reason: 'NONE' }, blocked = { state: 'BLOCKED', reason: 'QUALIFICATION_UNAVAILABLE' }, denied = { state: 'DENIED', reason: 'MENTOR_REQUIRED' };
assert.match(policy.postWriteFeedback('MENTOR_QA', blocked), /资格服务/);
assert.match(policy.postWriteFeedback('MENTOR_QA', denied), /管理员核实/);
assert.doesNotMatch(policy.postWriteFeedback('MENTOR_QA', denied), /追问/);
assert.equal(policy.postWriteFeedback('MENTOR_QA', allowed, true), '');
assert.match(policy.postWriteFeedback('MENTOR_QA', allowed), /未开放/);
flags.mentorAnswers = true;
assert.equal(policy.postWriteFeedback('MENTOR_QA', allowed), '');
assert.ok(policy.postWriteFeedback('MENTOR_QA'));
assert.ok(policy.postWriteFeedback('FUTURE', allowed));

// Real API mapping, with the shared HTTP boundary substituted.
const http = Object.fromEntries(['get', 'post', 'del'].map((method) => [method, async (url, data, options) => { calls.push({ method, url, data, options }); return {}; }]));
mock('utils/request.ts', { http, httpWithMeta: { get: http.get, post: async (url, data, options) => { calls.push({ method: 'POST', url, data, options }); return {}; } } });
const api = load('services/api.ts').api;
await api.post.getList({ pageSize: 20 });
assert.equal(calls.at(-1).data.postType, 'NORMAL');
await api.post.getUserLikePost('me');
assert.match(calls.at(-1).url, /postType=NORMAL/);
await api.post.getEditable('a/b');
assert.deepEqual(plain(calls.at(-1).data), { view: 'edit' });
assert.match(calls.at(-1).url, /a%2Fb/);
await api.post.edit('p', { content: 'draft' }, '"v1"');
assert.equal(calls.at(-1).method, 'POST');
assert.equal(calls.at(-1).url, '/v1/post/p:edit');
assert.equal(calls.at(-1).options.headers['If-Match'], '"v1"');
assert.equal(calls.at(-1).options.retryAuth, false);

const wire = (id, postType) => ({ id, postType, content: '内容', attachments: [], author: { id: 'author', nickname: '提问者' }, liked: false });
let feed = { list: [wire('old'), wire('n', 'NORMAL'), wire('q', 'MENTOR_QA'), wire('u', 'FUTURE')], hasMore: false, nextCursor: null };
api.post.getList = async (query) => { calls.push(query); return feed; };
api.post.getUserLikePost = async () => feed;
api.post.getDetail = async () => wire('q', 'MENTOR_QA');
api.post.create = async (payload) => { calls.push(payload); return wire('new', payload.postType); };
api.post.getEditable = async () => ({ data: { id: 'p', postType: 'NORMAL', content: 'base', title: null, attachmentItems: [], categoryId: null, topicIds: [] }, headers: { etag: '"v1"' } });
const posts = load('services/post.ts');
flags.organization = false;
assert.deepEqual(plain((await posts.fetchPostList({})).list.map((x) => x.id)), ['old', 'n']);
assert.deepEqual(plain((await posts.getUserPosts('me')).list.map((x) => x.id)), ['old', 'n']);
assert.deepEqual(plain((await posts.getUserLikedPosts('me')).list.map((x) => x.id)), ['old', 'n']);
flags.organization = true;

const dictionaries = load('services/post-dictionary.ts');
await dictionaries.getPostCategories('MENTOR_QA', 'category-cursor');
assert.deepEqual(plain(calls.at(-1).data), { postType: 'MENTOR_QA', status: 'ACTIVE', pageSize: 50, cursor: 'category-cursor' });
await dictionaries.getPostTopics('topic-cursor');
assert.equal(calls.at(-1).url, '/v1/topics');
assert.equal(calls.at(-1).data.postType, undefined);
for (const code of ['ACADEMIC', 'COMPETITION', 'EMPLOYMENT', 'SOCIAL_PRACTICE']) {
  const category = { id: `server-id-${code}`, code, name: code, postTypes: ['MENTOR_QA'], status: 'ACTIVE' };
  const card = posts.mapPostListItem({ ...wire(code, 'MENTOR_QA'), category, topics: [{ id: 't', name: '服务端话题' }], commentPermission: blocked });
  assert.equal(card.category.id, category.id);
  assert.equal(card.commentPermission.state, 'BLOCKED');
}
api.comment.getList = async () => ({ list: [{ id: 'root', content: '正式回答', author: { id: 'mentor' }, previewReplies: [{ id: 'follow', parentId: 'root', content: '追问', author: { id: 'author' }, replyToUser: { id: 'mentor' }, replyToCommentId: 'root', replyPermission: allowed }], replyCount: 1, replyPermission: allowed }], hasMore: false });
const comments = load('services/comment.ts');
const mapped = (await comments.getCommentList({ targetType: 'POST', targetId: 'q' })).list[0];
assert.equal(mapped.replyPermission.state, 'ALLOWED');
assert.equal(mapped.replyPreview[0].replyToCommentId, 'root');
assert.equal(mapped.replyPreview[0].replyPermission.state, 'ALLOWED');
mock('services/interact.ts', {});
const commentAction = load('actions/comment.ts');
api.comment.create = async (request) => { calls.push(request); return 'new-reply'; };
await commentAction.createCommentWithImage({ targetId: 'q', targetType: 'POST', parentId: 'root', replyToCommentId: 'follow', content: '导师回复' });
assert.equal(calls.at(-1).parentId, 'root');
assert.equal(calls.at(-1).replyToCommentId, 'follow');
assert.deepEqual(plain((await posts.fetchPostList({ postType: 'MENTOR_QA' })).list.map((x) => x.id)), ['q']);
assert.equal(calls.at(-1).postType, 'MENTOR_QA');
await assert.rejects(posts.fetchPostList({ postType: 'MENTOR_QA', lastId: '1' }));
feed = { list: [wire('q', 'MENTOR_QA')], hasMore: true, nextCursor: 'q' };
await assert.rejects(posts.fetchPostList({ postType: 'MENTOR_QA' }), /cursor/);
feed.cursor = 'opaque';
assert.equal((await posts.fetchPostList({ postType: 'MENTOR_QA' })).nextCursor, 'opaque');
await posts.publishPost({ content: '问题', title: '', attachmentItems: [], postType: 'MENTOR_QA', categoryId: 'server-category', topicIds: ['t'] });
assert.equal(calls.at(-1).content, '问题');
assert.deepEqual(plain(calls.at(-1).topicIds), ['t']);
flags.organization = false;
await assert.rejects(posts.publishPost({ content: '问题', postType: 'MENTOR_QA', categoryId: 'c' }));
await posts.publishPost({ content: '旧帖子', title: '', attachmentItems: [] });
assert.equal(calls.at(-1).postType, undefined);
flags.organization = true;

// Topic maximum, toggling, and dictionary IDs (no user-created names).
mock('services/post-dictionary.ts', { getPostTopics: async () => ({ items: [] }), getPostCategories: async () => ({ items: [] }) });
load('components/post-topic-picker/index.ts');
const picker = instance();
picker.data.items = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, status: 'ACTIVE' }));
picker.properties.selected = picker.data.items.slice(0, 3);
const before = calls.length;
picker.toggle({ currentTarget: { dataset: { id: 'd' } } });
assert.equal(calls.length, before);
picker.toggle({ currentTarget: { dataset: { id: 'b' } } });
assert.deepEqual(plain(calls.at(-1).detail.topics.map((x) => x.id)), ['a', 'c']);

// Page pagination and filter races: stale A cannot overwrite B.
const requests = [];
mock('actions/post.ts', { fetchPostList: (query) => { const d = deferred(); requests.push({ query, ...d }); return d.promise; }, getPostDetail: async () => ({ topics: [] }), publishPostAndSync: async () => {} });
load('subpkg_community/pages/post-list/list.ts');
const list = instance(); list.data.enabled = true;
const a = list.load(true);
list.data.categoryId = 'competition';
const b = list.load(true);
assert.equal(requests[1].query.categoryId, 'competition');
assert.equal(requests[1].query.cursor, undefined);
requests[1].resolve({ list: [{ id: 'b' }], hasMore: true, cursor: 'next-b' }); await b;
requests[0].resolve({ list: [{ id: 'a' }], hasMore: false }); await a;
assert.deepEqual(plain(list.data.posts.map((x) => x.id)), ['b']);
const more = list.load(false);
assert.equal(requests[2].query.cursor, 'next-b');
requests[2].resolve({ list: [{ id: 'b' }, { id: 'c' }], hasMore: false }); await more;
assert.deepEqual(plain(list.data.posts.map((x) => x.id)), ['b', 'c']);
list.data.enabled = false;
await list.load(true);
assert.equal(requests.length, 3);
list.data.enabled = true;
const oldFailure = list.load(true);
const newSuccess = list.load(true);
requests[4].resolve({ list: [{ id: 'newest' }], hasMore: false }); await newSuccess;
const toastCount = toasts.length;
requests[3].reject(new Error('obsolete failure')); await oldFailure;
assert.equal(toasts.length, toastCount);
assert.equal(list.data.error, '');

mock('services/person-binding.ts', { getMyPersonBinding: async () => ({ state: 'BOUND', personStatus: 'ACTIVE' }), personBindingEpoch: () => 0, watchPersonBinding: () => () => {} });
flags.communityV1 = true;
mock('actions/post-creation.ts', { pendingPostCreation: () => undefined, createCommunityComment: async (request) => { sent = request; if (sendFailure) throw sendFailure; return { id: 'pending-id' }; } });
// Shared comments: trusted per-target permissions and correct root/specific reply.
let sendFailure, sent;
mock('actions/comment.ts', { createCommentWithImage: async (request) => { sent = request; if (sendFailure) throw sendFailure; return 'pending-id'; } });
load('components/comment-panel/index.ts');
const panel = instance(); panel.properties = { postType: 'MENTOR_QA', commentPermission: blocked, targetId: 'q', targetType: 'POST', questionVersion: 'question-v1' };
panel.data.firstLoading = false;
panel.data.mentorName = '认证名称';
panel.data.canSend = true; panel._draftValue = '回答';
await panel.onSend(); assert.equal(sent, undefined);
panel.properties.commentPermission = denied;
await panel.onSend(); assert.equal(sent, undefined);
panel.properties.commentPermission = allowed;
panel._loadComments = async () => {}; panel._refreshPublicCount = async () => {};
panel._selectedFiles = [];
await panel.onSend();
assert.equal(sent.parentId, undefined);
assert.equal(panel.data.commentList[0].localPreview, true);
assert.equal(panel.data.commentList[0].nickName, '认证名称');
assert.equal(panel.data.submissionNotice, '');
assert.equal(sent.questionVersion, 'question-v1');
assert.equal(calls.filter((call) => call.name === 'refreshquestion').length, 1);
assert.equal(calls.some((call) => call.name === 'countchange' && call.detail.count === 1), true);
panel.data.commentList = [{ commentId: 'answer-root', replyPermission: allowed, replyList: [{ replyId: 'follow-up', replyPermission: allowed }], replyPreview: [] }];
panel.onReplyTap({ currentTarget: { dataset: { commentId: 'answer-root', replyToCommentId: 'follow-up', nickName: '提问者', userId: 'author' } } });
panel._draftValue = '导师二级回复'; panel.data.canSend = true;
await panel.onSend();
assert.equal(sent.parentId, 'answer-root'); assert.equal(sent.replyToCommentId, 'follow-up'); assert.equal(sent.questionVersion, undefined);
sendFailure = new Error('permission changed');
panel.data.replyTarget = { commentId: 'answer-root', replyToCommentId: 'answer-root' };
panel._draftValue = '保留草稿'; panel.data.canSend = true;
await panel.onSend(); assert.equal(panel._draftValue, '保留草稿');
assert.equal(panel.data.sending, false);
panel.properties.postType = 'FUTURE'; sent = undefined;
await panel.onSend(); assert.equal(sent, undefined);
panel.properties.postType = 'MENTOR_QA';
panel.properties.commentPermission = allowed;
panel.data.replyTarget = {};
definition.pageLifetimes.hide.call(panel);
await panel.onSend(); assert.equal(sent, undefined);
assert.match(panel.data.writeFeedback, /重新确认/);

mock('services/post-community.ts', { community: { myPost: async () => ({ post: { postType: 'NORMAL' }, submission: { lifecycle: { visibility: 'PUBLIC', safety: 'PASSED', authorDeleted: false, adminHidden: false }, availableActions: ['EDIT'] } }) } });
// Editing preserves draft and requires an explicit merge after 412.
const { HttpError, getHttpErrorMessage } = load('utils/error.ts');
assert.match(getHttpErrorMessage(503, '', '/problems/mentor-qualification-unavailable'), /资格服务/);
assert.match(getHttpErrorMessage(403, '', '/problems/mentor-answer-forbidden'), /权限/);
let editCount = 0;
let editedPatch;
mock('services/post.ts', { getEditablePost: async () => ({ post: { id: 'p', postType: 'NORMAL', content: 'server-new', title: null, attachmentItems: [], categoryId: null, topicIds: [] }, etag: '"v2"' }), editPost: async (id, patch) => { editedPatch = patch; editCount++; throw new HttpError(412); } });
load('subpkg_community/pages/post-edit/post-edit.ts');
const editor = instance();
editor.data.postId = 'p'; editor.data.content = 'my draft'; editor.data.canSubmit = true;
editor._base = { id: 'p', postType: 'NORMAL', content: 'old', title: null, attachmentItems: [], categoryId: null, topicIds: [] }; editor._etag = '"v1"';
await editor.onSubmit();
assert.equal(editor.data.content, 'my draft'); assert.equal(editor.data.conflict, true);
assert.equal(editor._etag, '"v1"');
assert.equal(editedPatch.categoryId, undefined);
assert.equal(editedPatch.topicIds, undefined);
assert.equal(editedPatch.postType, undefined);
await editor.onSubmit(); assert.equal(editCount, 1);
editor.acceptMerge();
assert.equal(editor._etag, '"v2"'); assert.equal(editor.data.content, 'my draft');

// Native transport is deliberately blocked; it must never emit a replacement POST.
cache.delete(absolute('utils/request.ts')); mocks.delete(absolute('utils/request.ts'));
mock('utils/auth-transport.ts', { getAuthToken: async () => 'test-token' }); mock('utils/transfer.ts', {}); mock('utils/stream.ts', {});
const native = load('utils/request.ts');
await assert.rejects(native.httpWithMeta.patch('/v1/post/p', { content: 'draft' }), /编辑服务暂不可用/);
wx.request = (request) => request.success({ statusCode: 400, header: {}, data: { type: '/problems/post-topic-invalid', errors: [{ in: 'body', pointer: '/topicIds/0', code: 'INACTIVE', detail: 'private detail' }] } });
await assert.rejects(native.http.post('/v1/post', {}, { sensitive: true, retryAuth: false }), (error) => {
  assert.equal(error.problemType, '/problems/post-topic-invalid');
  assert.equal(error.raw, undefined);
  assert.deepEqual(plain(error.validationErrors), [{ in: 'body', pointer: '/topicIds/0', code: 'INACTIVE' }]);
  return true;
});
console.log('PASS Post/mentor QA: NORMAL isolation/legacy fallback, Contract requests, topics, cursor/races, trusted comment permissions/reply targets/pending moderation, ETag/conflict draft, native PATCH blocker. VM/HTTP substitutes only.');
