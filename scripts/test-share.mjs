import { setTimeout, clearTimeout, setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(relative, globals = {}) {
  const cache = new Map();
  function moduleAt(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    vm.runInNewContext(
      js,
      {
        exports,
        setTimeout,
        clearTimeout,
        require: (name) => moduleAt(path.resolve(path.dirname(filename), `${name}.ts`)),
        ...globals,
      },
      { filename },
    );
    return exports;
  }
  return moduleAt(path.join(root, relative));
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

// A 的迟到结果不能覆盖 B；同一 Canvas 上的任务不能同时绘制。
const { ShareTask } = load('utils/share_poster/shareTask.ts');
const task = new ShareTask();
const first = deferred();
const second = deferred();
const events = [];
let secondStarted = false;
task.run(
  () => first.promise,
  (state, image) => events.push(['A', state, image]),
);
await flush();
task.run(
  () => {
    secondStarted = true;
    return second.promise;
  },
  (state, image) => events.push(['B', state, image]),
);
await flush();
assert.equal(secondStarted, false);
first.resolve('A.png');
await flush();
assert.equal(secondStarted, true);
assert.equal(
  events.some(([id, state]) => id === 'A' && state === 'ready'),
  false,
);
second.resolve('B.png');
await flush();
assert.deepEqual(events.at(-1), ['B', 'ready', 'B.png']);

// 失败后可以重试；销毁后不能 setData，也不能再启动排队中的任务。
const taskErrors = [];
const exportFailure = new Error('export failed');
task.run(
  () => Promise.reject(exportFailure),
  (state, image) => events.push(['C', state, image]),
  (error) => {
    taskErrors.push(error);
    throw new Error('logger unavailable');
  },
);
await flush();
assert.deepEqual(events.at(-1), ['C', 'error', '']);
assert.equal(taskErrors[0], exportFailure);
task.run(
  () => Promise.resolve('retry.png'),
  (state, image) => events.push(['C', state, image]),
);
await flush();
assert.deepEqual(events.at(-1), ['C', 'ready', 'retry.png']);
const pending = deferred();
task.run(
  () => pending.promise,
  (state, image) => events.push(['D', state, image]),
);
await flush();
let queuedStarted = false;
task.run(
  () => {
    queuedStarted = true;
    return Promise.resolve('queued.png');
  },
  () => {
    /* ignore stale output */
  },
);
task.dispose();
pending.resolve('late.png');
await flush();
assert.equal(queuedStarted, false);
assert.equal(
  events.some(([id, state]) => id === 'D' && state === 'ready'),
  false,
);

// 导出 Promise 必须等到 wx 回调，且导出失败必须向上拒绝。
let exportOptions;
const pc = load('utils/share_poster/posterCanvas.ts', {
  wx: {
    canvasToTempFilePath: (options) => {
      exportOptions = options;
    },
  },
});
let exported = false;
const exportedFile = pc.finalize({}, {}).then((value) => {
  exported = true;
  return value;
});
await flush();
assert.equal(exported, false);
assert.equal(exportOptions.destWidth, 1080);
assert.equal(exportOptions.destHeight, 864);
exportOptions.success({ tempFilePath: 'poster.png' });
assert.equal(await exportedFile, 'poster.png');
const failedExport = pc.finalize({}, {});
exportOptions.fail({ errMsg: 'disk full' });
await assert.rejects(failedExport, /disk full/);

// 没有任何图片事件时必须超时结束，且清理监听器，避免队列永久卡住。
let timeout;
const timed = load('utils/share_poster/posterCanvas.ts', {
  setTimeout: (callback) => {
    timeout = callback;
    return 1;
  },
  clearTimeout() {
    /* fake timer */
  },
});
const image = {};
const loading = timed.loadImage({ createImage: () => image }, 'slow-image');
timeout();
await assert.rejects(loading, /超时/);
assert.equal(typeof image.onload, 'function');

// 真实换行与码点截断，文字不得越过可用宽度。
const measure = { measureText: (value) => ({ width: Array.from(value).length * 10 }) };
assert.deepEqual(Array.from(pc.wrapText(measure, '第一行\n第二行', 100, 3)), ['第一行', '第二行']);
assert.deepEqual(Array.from(pc.wrapText(measure, '😀😀😀😀', 30, 1)), ['😀😀…']);
assert.deepEqual(Array.from(pc.wrapText(measure, 'abcdefghi', 40, 2)), ['abcd', 'efg…']);

// Behavior 状态覆盖失败/重试、同内容缓存、预览失败及原生分享兜底。
const errorLogs = [];
const { useSharePoster } = load('behaviors/useSharePoster.ts', {
  Behavior: (options) => options,
  wx: {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'trial' } }),
    getRealtimeLogManager: () => ({ error: (...args) => errorLogs.push(args) }),
  },
  console: { ...console, error() {} },
});
const options = useSharePoster();
const page = {
  data: { ...options.data },
  setData(patch) {
    Object.assign(this.data, patch);
  },
};
Object.entries(options.methods).forEach(([key, method]) => {
  page[key] = method.bind(page);
});
options.lifetimes.attached.call(page);
let attempts = 0;
const request = {
  key: 'post:B:v1',
  title: 'B title',
  path: '/detail?id=B',
  render: () => {
    attempts++;
    return attempts === 1 ? Promise.reject(new Error('fail')) : Promise.resolve('B.png');
  },
};
page._prepareShare(request);
assert.equal(page.data.shareStatus, 'loading');
assert.equal(page._getShareContent().path, '/detail?id=B');
assert.equal(page._getShareContent().title, 'B title');
assert.match(page._getShareContent().imageUrl, /index-share/);
await flush();
assert.equal(page.data.shareStatus, 'error');
assert.equal(errorLogs.length, 1);
assert.equal(errorLogs[0][0], 'useSharePoster._generateSharePoster');
const loggedDetails = JSON.parse(errorLogs[0][2]);
assert.equal(loggedDetails.page, '/detail');
assert.match(loggedDetails.message, /fail/);
page.onRetryShare();
await flush();
assert.equal(page.data.shareStatus, 'ready');
assert.equal(page._getShareContent().imageUrl, 'B.png');
page._prepareShare(request);
await flush();
assert.equal(attempts, 2);
page.onSharePreviewError();
assert.equal(page.data.currentShareImage, '');
assert.equal(page.data.shareStatus, 'error');
// 帖子不传标题时不得补正文或沿用上一次标题，加载中与完成后行为一致。
page._prepareShare({
  key: 'post:C:v1',
  path: '/detail?id=C',
  render: () => Promise.resolve('C.png'),
});
assert.equal(Object.hasOwn(page._getShareContent(), 'title'), false);
await flush();
assert.equal(page._getShareContent().imageUrl, 'C.png');
assert.equal(Object.hasOwn(page._getShareContent(), 'title'), false);
options.lifetimes.detached.call(page);

console.log(
  '分享回归通过：任务串行、过期结果、销毁、失败重试、导出完成/失败、图片超时、文本换行、分享兜底。',
);

// 分享面板手势接线与动画时序；WXS 使用 JS 容器执行，不能代替真机事件分发验证。
const panelWxml = fs.readFileSync(path.join(root, 'components/share-panel/index.wxml'), 'utf8');
assert.match(panelWxml, /class="sp-root"[^>]*catchtouchmove="{{drag.noop}}"[^>]*catchtap="noop"/);
assert.match(
  panelWxml,
  /class="sp-sheet J-sheet"[^>]*bindtouchstart="{{drag.handleStart}}"[^>]*bindtouchend="{{drag.handleEnd}}"[^>]*catchtouchmove="{{drag.handleMove}}"/,
);
assert.doesNotMatch(panelWxml, /<scroll-view/);
const timers = new Map();
let timerId = 0;
const animations = [];
const closeEvents = [];
const { useSheet } = load('behaviors/sheet-mixin.ts', {
  Behavior: (value) => value,
  wx: {
    getWindowInfo: () => ({ windowHeight: 800 }),
    hideKeyboard() {
      /* no keyboard */
    },
  },
  setTimeout: (callback, delay) => {
    timers.set(++timerId, { callback, delay });
    return timerId;
  },
  clearTimeout: (id) => timers.delete(id),
});
const sheetOptions = useSheet({ preserveWxsExitAnimation: true });
const sheet = {
  data: { ...sheetOptions.data },
  setData(patch) {
    Object.assign(this.data, patch);
  },
  animate(...args) {
    animations.push(args);
  },
  triggerEvent(name) {
    closeEvents.push(name);
  },
};
Object.entries(sheetOptions.methods).forEach(([key, method]) => {
  sheet[key] = method.bind(sheet);
});
sheetOptions.lifetimes.attached.call(sheet);
const runTimer = (delay) => {
  const entry = [...timers].find(([, timer]) => timer.delay === delay);
  assert.ok(entry, `missing ${delay}ms timer`);
  timers.delete(entry[0]);
  entry[1].callback();
};
runTimer(30);
assert.equal(animations.length, 2);
assert.equal(animations[0][2], 380);
const wxsModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/drag.wxs'), 'utf8'), {
  module: wxsModule,
});
const drag = wxsModule.exports;
const styles = { '.J-sheet': {}, '.J-mask': {} };
const instance = {
  selectComponent: (selector) => ({ setStyle: (patch) => Object.assign(styles[selector], patch) }),
  callMethod: (name) => sheet[name](),
};
const touch = (y, time) => ({
  touches: [{ clientY: y, clientX: 0 }],
  changedTouches: [{ clientY: y, clientX: 0 }],
  timeStamp: time,
  currentTarget: { dataset: { panelH: 720 } },
});
drag.handleStart(touch(100, 0), instance);
drag.handleMove(touch(125, 200), instance);
assert.notEqual(styles['.J-sheet'].transform, 'translateY(0px)');
drag.handleEnd(touch(125, 300), instance);
assert.equal(styles['.J-sheet'].transform, 'translateY(0px)');
assert.match(styles['.J-sheet'].transition, /\.35s/);
assert.equal(closeEvents.length, 0);
drag.handleStart(touch(100, 400), instance);
drag.handleEnd(touch(240, 700), instance);
assert.equal(styles['.J-sheet'].transform, 'translateY(100%)');
assert.match(styles['.J-sheet'].transition, /\.32s/);
assert.equal(sheet.data.sheetTranslateY, 0, 'must not overwrite WXS exit with an immediate jump');
assert.equal(closeEvents.length, 0);
runTimer(340);
assert.deepEqual(closeEvents, ['close']);
sheetOptions.lifetimes.detached.call(sheet);
assert.equal(timers.size, 0);
console.log(
  '分享弹窗回归通过：整面板拖拽接线、外层触摸拦截、入场动画、短拖回弹、下滑退场完成后关闭。',
);
