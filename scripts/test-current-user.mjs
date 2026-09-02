// Node + VM 回归：真实 Store/Action/投影，不访问网络，也不替代微信设备验收。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let now = 1000;
const reads = [],
  writes = [],
  persisted = [];
const modules = new Map();
const mocks = new Map([
  [
    'services/user.ts',
    {
      getCurrentProfile: () => {
        const task = deferred();
        reads.push(task);
        return task.promise;
      },
      updateUserInfo: (data) => {
        const task = deferred();
        writes.push({ ...task, data });
        return task.promise;
      },
    },
  ],
  ['utils/auth-session.ts', { waitForAuthStable: async () => undefined }],
  [
    'utils/storage.ts',
    {
      STORAGE_KEYS: { USER_INFO: 'userInfo' },
      storage: { set: (key, value) => persisted.push(value) },
    },
  ],
  ['utils/logger.ts', { createLogger: () => ({ warn: () => undefined, error: () => undefined }) }],
]);
function load(relative) {
  const filename = path.resolve(root, relative);
  const key = path.relative(root, filename).replaceAll('\\', '/');
  if (mocks.has(key)) return mocks.get(key);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: false,
    },
  }).outputText;
  vm.runInNewContext(
    js,
    {
      exports,
      Date: { now: () => now },
      require: (name) => load(path.resolve(path.dirname(filename), `${name}.ts`)),
    },
    { filename },
  );
  return exports;
}

const { appStore } = load('stores/index.ts');
const action = load('actions/current-user.ts');
const projection = load('utils/user-projection.ts');
const login = (id) =>
  appStore.set('userInfo', { id, nickname: '登录摘要', avatarUrl: 'login.png', role: 1 });
const profile = (nickname, id = 'me') => ({
  id,
  nickname,
  avatarUrl: `${nickname}.png`,
  bannerUrl: 'banner.png',
  bio: '简介',
  role: 1,
});
login('me');
let seen;
const off = action.watchCurrentProfile((value) => {
  seen = value;
});
assert.equal(seen, null);
assert.equal(reads.length, 0, '订阅头像不能触发请求');

const first = action.getCurrentProfile();
const second = action.getCurrentProfile();
await tick();
assert.equal(reads.length, 1, '并发读取合并');
reads[0].resolve(profile('旧昵称'));
await Promise.all([first, second]);
assert.equal((await action.getCurrentProfile()).nickname, '旧昵称');
assert.equal(reads.length, 1, '有效缓存不重复请求');

now += action.PROFILE_TTL_MS + 1;
assert.equal((await action.getCurrentProfile({ allowStale: true })).nickname, '旧昵称');
await tick();
assert.equal(reads.length, 2, '过期缓存后台校验');
reads[1].resolve(profile('校验后'));
await tick();
assert.equal(seen.nickname, '校验后');

const lateRead = action.getCurrentProfile({ force: true });
await tick();
const saved = action.saveCurrentProfile({ nickname: '提交昵称', avatarObjectKey: 'owned/key' });
await tick();
await assert.rejects(action.saveCurrentProfile({ nickname: '重复提交' }), /正在保存/);
writes[0].resolve(profile('服务端最终昵称'));
await saved;
reads[2].resolve(profile('迟到旧值'));
assert.equal((await lateRead).nickname, '服务端最终昵称', '旧 GET 的调用方也只能拿到新资料');
assert.equal(seen.nickname, '服务端最终昵称');
assert.equal(persisted.at(-1).nickname, '服务端最终昵称');
assert.equal(reads.length, 3, 'PUT 返回资料后不额外 GET');

const failedSave = action.saveCurrentProfile({ bio: '失败改动' });
await tick();
writes[1].reject(new Error('保存失败'));
await assert.rejects(failedSave, /保存失败/);
assert.equal(action.peekCurrentProfile().bio, '简介', '失败不污染缓存');

const oldAccountRead = action.getCurrentProfile({ force: true });
await tick();
login('');
login('other');
assert.equal(action.peekCurrentProfile(), null);
reads[3].resolve(profile('旧账号响应'));
await assert.rejects(oldAccountRead, /登录状态/);
assert.equal(action.peekCurrentProfile(), null);

login('me');
const oldSessionSave = action.saveCurrentProfile({ nickname: '旧会话保存' });
await tick();
login('');
login('me');
writes[2].resolve(profile('旧会话保存'));
await assert.rejects(oldSessionSave, /登录状态/);
assert.equal(action.peekCurrentProfile(), null, '同账号重新登录也不能接纳旧会话响应');

const reload = action.getCurrentProfile();
await tick();
reads[4].resolve(profile('最新'));
await reload;
const fresh = action.peekCurrentProfile();
const own = {
  id: 'p',
  userId: 'me',
  nickname: '旧',
  avatarUrl: 'old.png',
  content: '帖子内容',
  likeCount: 7,
};
const other = { ...own, id: 'q', userId: 'other' };
const projected = projection.projectPostAuthor(own, fresh);
assert.equal(projected.nickname, '最新');
assert.equal(projected.likeCount, 7);
assert.equal(own.nickname, '旧', '不修改接口原对象');
assert.equal(projection.projectPostAuthor(other, fresh), other, '不改其他作者');
assert.equal(projection.projectPostAuthor(projected, fresh), projected, '无变化保持引用');
const detail = projection.projectPostAuthor(
  { ...own, avatar: 'old.png', _avatarChar: '旧', _avatarBg: '' },
  fresh,
);
assert.equal(detail.avatar, '最新.png');
assert.equal(detail._avatarChar, '最');
const reply = {
  replyId: 'r',
  userId: 'me',
  nickName: '旧',
  avatarUrl: 'old.png',
  _avatarChar: '',
  _avatarBg: '',
  replyToUserId: 'me',
  replyToName: '旧',
};
const comment = {
  commentId: 'c',
  userId: 'other',
  nickName: '别人',
  replyPreview: [reply],
  replyList: [reply],
  repliesExpanded: true,
  lastId: 'cursor',
};
const projectedComment = projection.projectCommentAuthor(comment, fresh);
assert.equal(projectedComment.nickName, '别人');
assert.equal(projectedComment.replyList[0].nickName, '最新');
assert.equal(projectedComment.replyPreview[0].replyToName, '最新');
assert.equal(projectedComment.lastId, 'cursor');
assert.equal(projectedComment.repliesExpanded, true);

// 实际评论组件订阅与帖子 Behavior：保存后更新全部展示副本，销毁后不再写页面。
let componentDefinition;
mocks.set('utils/defineComponent.ts', {
  default: () => (value) => {
    componentDefinition = value;
  },
});
mocks.set('behaviors/sheet-mixin.ts', { useSheet: () => ({}) });
mocks.set('utils/wx-promise.ts', {});
mocks.set('utils/constants.ts', { TARGET_TYPES: { POST: { value: '1' } } });
mocks.set('utils/notify.ts', {});
mocks.set('actions/media.ts', {});
mocks.set('actions/comment.ts', {
  syncCommentAuthor: (item) => projection.projectCommentAuthor(item, action.peekCurrentProfile()),
});
load('components/comment-panel/index.ts');
const setData = function (patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    const field = parts.pop();
    parts.reduce((current, part) => current[part], this.data)[field] = value;
  }
};
const panel = {
  data: {
    ...componentDefinition.data,
    commentList: [comment],
    replyTarget: { userId: 'me', nickName: '旧' },
  },
  properties: { totalCount: 1 },
  setData,
};
componentDefinition.lifetimes.attached.call(panel);
assert.equal(panel.data.selfAvatarUrl, '最新.png');

mocks.set('utils/defineBehavior.ts', { default: () => (value) => value });
mocks.set('behaviors/useSharePoster.ts', { useSharePoster: () => ({}) });
mocks.set('utils/share_poster/postPoster.ts', {});
mocks.set('utils/event-bus.ts', { EVENTS: {}, eventBus: { on: () => () => undefined } });
mocks.set('actions/post.ts', {
  syncPostAuthor: (item) => projection.projectPostAuthor(item, action.peekCurrentProfile()),
});
const behavior = load('behaviors/usePostActions.ts').usePostActions({
  postListKeys: ['posts', 'postsCache', 'likesCache'],
});
const host = {
  data: { ...behavior.data, posts: [own], postsCache: [own], likesCache: [own, other] },
  setData,
};
behavior.lifetimes.attached.call(host);
const readCount = reads.length;
const lifecycleSave = action.saveCurrentProfile({ nickname: '同步后' });
await tick();
writes[3].resolve(profile('同步后'));
await lifecycleSave;
assert.equal(reads.length, readCount, '评论输入栏和帖子订阅不发请求');
assert.equal(panel.data.selfAvatarUrl, '同步后.png');
assert.equal(panel.data.replyTarget.nickName, '同步后');
assert.equal(panel.data.commentList[0].replyPreview[0].nickName, '同步后');
for (const key of ['posts', 'postsCache', 'likesCache'])
  assert.equal(host.data[key][0].nickname, '同步后');
assert.equal(host.data.likesCache[1], other);
componentDefinition.lifetimes.detached.call(panel);
behavior.lifetimes.detached.call(host);
const lastSave = action.saveCurrentProfile({ nickname: '销毁后' });
await tick();
writes[4].resolve(profile('销毁后'));
await lastSave;
assert.equal(panel.data.selfAvatarUrl, '同步后.png');
assert.equal(host.data.posts[0].nickname, '同步后');
off();
login('');
assert.equal(seen.nickname, '销毁后', '销毁时解除订阅');
console.log('PASS current-user: 缓存、合并请求、TTL、保存、旧响应、账号隔离、作者投影、解除订阅');
