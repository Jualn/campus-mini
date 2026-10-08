import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout } from 'node:timers';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file, require) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  vm.runInNewContext(js, { exports, require, Error, Promise });
  return exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let userId = 'user-a';
const activityRead = deferred();
const activityActions = compile('subpkg_activity/actions/activity.ts', (name) => {
  if (name.endsWith('/activity')) {
    return {
      getActivityDetail: () => activityRead.promise,
      getActivityList: async () => ({ list: [] }),
    };
  }
  if (name.endsWith('/auth')) return { ensureLogin: async () => undefined };
  if (name.endsWith('/helper')) return { getUserId: () => userId };
  if (name.endsWith('/search')) return { searchActivities: async () => ({ list: [] }) };
  return {};
});
const staleActivity = activityActions.getActivityDetail('activity:1');
await new Promise((resolve) => setTimeout(resolve, 0));
userId = 'user-b';
activityRead.resolve({ id: 'activity:1' });
await assert.rejects(staleActivity, /登录状态已变化/);

const publicRead = deferred();
const publicActions = compile('subpkg_public_event/actions/public-event.ts', (name) => {
  if (name.endsWith('/public-event')) {
    return { getPublicEventDetail: () => publicRead.promise };
  }
  if (name.endsWith('/auth')) return { ensureLogin: async () => undefined };
  if (name.endsWith('/helper')) return { getUserId: () => userId };
  return {};
});
const stalePublicEvent = publicActions.getPublicEventDetail('public-event:1');
await new Promise((resolve) => setTimeout(resolve, 0));
userId = 'user-c';
publicRead.resolve({ id: 'public-event:1' });
await assert.rejects(stalePublicEvent, /登录状态已变化/);

console.log('PASS: stale Activity/PublicEvent responses cannot cross current-user identity');
