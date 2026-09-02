// Node 回归：验证组件事件和占位逻辑，不替代微信原生 textarea / 键盘验证。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let definition;
let request;
let failSend = true;
const ticks = [];
const mocks = {
  '../../utils/defineComponent': { default: () => (options) => (definition = options) },
  '../../behaviors/sheet-mixin': { useSheet: () => ({}) },
  '../../stores/helper': { getUserInfo: () => '' },
  '../../actions/current-user': {
    getCurrentIdentity: () => ({ id: 'me', nickname: '我', avatarUrl: '' }),
    watchCurrentIdentity: (callback) => {
      callback();
      return () => undefined;
    },
  },
  '../../utils/logger': { createLogger: () => ({ error: () => undefined }) },
  '../../utils/wx-promise': {},
  '../../utils/notify': { notifyToast: () => undefined },
  '../../utils/constants': {},
  '../../actions/media': {},
  '../../actions/comment': {
    syncCommentAuthor: (item) => item,
    createCommentWithImage: async (args) => {
      request = args;
      if (failSend) throw new Error('模拟发送失败');
      return 'server-comment';
    },
  },
};
function load(filename) {
  const exports = {};
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
      wx: { nextTick: (callback) => ticks.push(callback) },
      require: (name) => mocks[name] ?? load(path.resolve(path.dirname(filename), `${name}.ts`)),
    },
    { filename },
  );
  return exports;
}
load(path.join(root, 'components/comment-panel/index.ts'));
const flush = () => {
  while (ticks.length) ticks.shift()();
};
const patches = [];
let measuredHeight = 54;
let measurements = 0;
const panel = {
  data: JSON.parse(JSON.stringify(definition.data)),
  properties: { mode: 'inline', targetId: 'test-post', targetType: '1', totalCount: 0 },
  ...definition.methods,
  setData(patch) {
    patches.push(patch);
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
      const field = parts.pop();
      const target = parts.reduce((current, part) => current[part], this.data);
      target[field] = value;
    }
    if (
      Object.keys(patch).some((key) =>
        ['inputHeightRpx', 'previewImage', 'replyTarget', 'keyboardOpen'].includes(key),
      )
    ) {
      definition.observers['inputHeightRpx, previewImage, replyTarget.nickName, keyboardOpen'].call(
        this,
      );
    }
  },
  triggerEvent: () => undefined,
  createSelectorQuery() {
    let onRect;
    return {
      select() {
        return this;
      },
      boundingClientRect(callback) {
        onRect = callback;
        return this;
      },
      exec() {
        measurements++;
        onRect({ height: measuredHeight });
      },
    };
  },
};
definition.lifetimes.attached.call(panel);
definition.lifetimes.ready.call(panel);
flush();
assert.equal(panel.data.composerHeight, 54);

// 连续输入只改变原生草稿，不逐字回写 value；发送必须拿到最新文字。
patches.length = 0;
panel.onInputChange({ detail: { value: '第一段' } });
panel.onInputChange({ detail: { value: '第一段\n最新文字' } });
assert.equal(patches.length, 1);
assert.equal(
  patches.some((patch) => 'inputValue' in patch),
  false,
);
assert.equal(panel._draftValue, '第一段\n最新文字');

// 增高、上限、收回；同帧多次更新只测量一次最终的完整栏高。
const before = measurements;
panel.onInputLineChange({ detail: { lineCount: 2 } });
panel.onInputLineChange({ detail: { lineCount: 8 } });
assert.equal(panel.data.inputHeightRpx, 176);
measuredHeight = 120;
flush();
assert.equal(measurements, before + 1);
assert.equal(panel.data.composerHeight, 120);

// 重复键盘事件不重复写入；失焦不抢先落下；收起时归零，不再叠加安全区。
panel.onInputKeyboardHeightChange({ detail: { height: 300 } });
const afterOpen = patches.length;
panel.onInputKeyboardHeightChange({ detail: { height: 300 } });
assert.equal(patches.length, afterOpen);
panel.onInputBlur();
assert.equal(panel.data.keyboardBottom, 300);
panel.onInputKeyboardHeightChange({ detail: { height: 0 } });
assert.equal(panel.data.keyboardBottom, 0);
assert.equal(panel.data.keyboardOpen, false);
flush();

// 发送失败恢复原生草稿绑定、展开高度和可发送状态。
await panel.onSend();
assert.equal(request.content, '第一段\n最新文字');
assert.equal(panel._draftValue, '第一段\n最新文字');
assert.equal(panel.data.inputValue, '第一段\n最新文字');
assert.equal(panel.data.inputHeightRpx, 176);
assert.equal(panel.data.canSend, true);
assert.equal(panel.data.commentList.length, 0);

// 有配图而无文字时，按钮外观与实际发送入口一致，失败仍可恢复配图。
panel.onInputChange({ detail: { value: '' } });
panel.onInputLineChange({ detail: { lineCount: 1 } });
panel.setData({ previewImage: 'test-image' });
panel._selectedFiles = [{ filePath: 'test-image' }];
await panel.onSend();
assert.equal(request.content, '');
assert.equal(request.imageFile.filePath, 'test-image');
assert.equal(panel.data.previewImage, 'test-image');
assert.equal(panel.data.inputHeightRpx, 44);
flush();

// 成功发送清空草稿、配图和展开高度，乐观评论替换成服务端 id。
failSend = false;
panel.onInputChange({ detail: { value: '最终确认发送' } });
panel.onInputLineChange({ detail: { lineCount: 3 } });
await panel.onSend();
assert.equal(request.content, '最终确认发送');
assert.equal(panel._draftValue, '');
assert.equal(panel.data.inputValue, '');
assert.equal(panel.data.previewImage, '');
assert.equal(panel.data.inputHeightRpx, 44);
assert.equal(panel.data.commentList[0].commentId, 'server-comment');
flush();

// 回复和配图占位跟随实际测量；销毁后不再测量或写回。
measuredHeight = 200;
panel.setData({ replyTarget: { nickName: '同学' } });
flush();
assert.equal(panel.data.composerHeight, 200);
panel._queueComposerMeasure();
definition.lifetimes.detached.call(panel);
const afterDetach = patches.length;
flush();
assert.equal(patches.length, afterDetach);
process.stdout.write('Comment composer regression checks passed.\n');
