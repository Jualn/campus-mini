import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [];
const http = {};
for (const method of ['get', 'put', 'del']) {
  http[method] = async (...args) => {
    calls.push([method, ...args]);
    return method === 'del' ? undefined : { subscribed: true, items: [] };
  };
}
const exports = {};
const js = ts.transpileModule(fs.readFileSync('subpkg_activity/services/event-api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(js, {
  exports,
  require: () => ({ http, httpWithMeta: {} }),
});
const id = 'activity:9223372036854775808';
await exports.eventApi.activities.subscription(id);
await exports.eventApi.activities.subscribe(id);
await exports.eventApi.activities.unsubscribe(id);
const publicEventId = 'public-event:opaque/01';
await exports.eventApi.publicEvents.subscription(publicEventId);
await exports.eventApi.publicEvents.subscribe(publicEventId);
await exports.eventApi.publicEvents.unsubscribe(publicEventId);
assert.equal(calls[0][1], `/v1/activities/${encodeURIComponent(id)}/subscription`);
assert.equal(calls[1][0], 'put');
assert.equal(calls[2][0], 'del');
assert.equal(
  calls[3][1],
  `/v1/public-events/${encodeURIComponent(publicEventId)}/subscription`,
);
assert.equal(calls[4][0], 'put');
assert.equal(calls[5][0], 'del');
assert.ok(calls.every((call) => call.at(-1).auth === 'required'));
assert.ok(calls.every((call) => call.at(-1).sensitive === true));
console.log(
  'PASS: canonical Activity/PublicEvent subscriptions use GET/PUT/DELETE and preserve opaque IDs',
);
