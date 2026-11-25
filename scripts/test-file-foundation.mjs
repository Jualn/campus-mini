import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { setTimeout, clearTimeout } from 'node:timers';

// Actual shipped SDK + synthetic wx transport; no COS or device claims.
const compile = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const requests = [], reads = [];
let size = 100, respond;
const wx = {
  canIUse: () => false, getStorageSync: () => undefined, setStorageSync() {},
  getSystemInfoSync: () => ({ SDKVersion: '3.0.0' }),
  getFileSystemManager: () => ({ readFile: (o) => {
    reads.push(o.filePath);
    o.success({ data: new ArrayBuffer(size) });
  } }),
  request: (o) => {
    requests.push(o);
    respond(o);
    return {};
  },
  uploadFile: () => { throw new Error('PostObject is forbidden'); },
};
const module = { exports: {} };
vm.runInNewContext(fs.readFileSync('miniprogram_npm/cos-wx-sdk-v5/index.js', 'utf8'), {
  module, exports: module.exports, wx, window: {}, setTimeout, clearTimeout, ArrayBuffer, Uint8Array,
});
const cos = {};
vm.runInNewContext(compile('utils/cos.ts'), {
  exports: cos, wx, ArrayBuffer,
  require: (name) => {
    assert.ok(name.includes('cos-wx-sdk'));
    return module.exports;
  },
});
const credential = {
  bucket: 'synthetic-1250000000', region: 'ap-nanjing', objectKeys: ['media/a', 'media/b', 'media/c'],
  tmpSecretId: 'synthetic-id', tmpSecretKey: 'synthetic-key', sessionToken: 'synthetic-token',
  expiredTime: Math.floor(Date.now() / 1000) + 600,
};
const reset = () => { requests.length = 0; reads.length = 0; };
const success = (o) => o.success({ statusCode: 200, header: { etag: 'synthetic' }, data: '' });
const reject409 = (o) => o.success({ statusCode: 409,
  header: { 'x-cos-request-id': 'synthetic-conflict' },
  data: '<Error><Code>ForbidOverwrite</Code><Message>Object exists</Message></Error>',
});
const headers = { 'X-COS-FORBID-OVERWRITE': 'false', 'x-cos-forbid-overwrite': 'false' };
const assertPut = (o) => {
  assert.equal(o.method, 'PUT');
  assert.equal(o.header['x-cos-forbid-overwrite'], 'true');
  assert.equal(Object.keys(o.header).filter((x) => x.toLowerCase() === 'x-cos-forbid-overwrite').length, 1);
  assert.equal(new URL(o.url).search, ''); // No multipart init/parts/complete.
};
// No caller opt-in: default and legacy false both remain safe above old SDK thresholds.
respond = success;
for (size of [100, 1048577, 10485761, 20 * 1024 * 1024]) {
  for (const singlePut of [undefined, false, true]) {
    reset();
    await cos.uploadCosFile({ credential, filePath: '/synthetic/image.jpg', headers, singlePut });
    assert.equal(requests.length, 1);
    assertPut(requests[0]);
    assert.equal(requests[0].data.byteLength, size);
    assert.ok(requests[0].header.Authorization || requests[0].header.authorization);
  }
}
size = 100;
reset();
const files = credential.objectKeys.map((objectKey, index) => ({
  objectKey, filePath: `/synthetic/${index}.jpg`, contentType: 'image/jpeg', headers,
}));
const results = await cos.uploadCosFilesBatch(credential, files);
assert.deepEqual(Array.from(results, (x) => x.objectKey), credential.objectKeys);
assert.deepEqual(reads, files.map((x) => x.filePath));
assert.equal(requests.length, 3);
requests.forEach(assertPut);
// Partial batch failure never resolves with URL-only success or uploads later files.
reset();
respond = (o) => new URL(o.url).pathname.endsWith('/b') ? reject409(o) : success(o);
await assert.rejects(cos.uploadCosFilesBatch(credential, files), /重新上传/);
assert.equal(requests.length, 2);
assert.equal(reads.length, 2);
requests.forEach(assertPut);
// A lost PUT response can lead to a bounded SDK retry, then conflict. Never claim success.
reset();
respond = (o) => requests.length === 1 ? o.fail({ errMsg: 'request:fail timeout' }) : reject409(o);
await assert.rejects(cos.uploadCosFile({ credential, filePath: '/synthetic/lost.jpg' }));
assert.ok(requests.length >= 1 && requests.length <= 4);
requests.forEach(assertPut);
console.log(`PASS SDK lost-response failure remains rejected (${requests.length} protected PUT attempt(s)).`);
// Presigned PUT also forces the header and never retries a conflict/timeout.
const presigned = { bucket: credential.bucket, region: credential.region, objectKeys: ['media/a'],
  uploadUrl: 'https://synthetic.example/media/a?signature=synthetic' };
for (const response of [success, reject409, (o) => o.fail({ errMsg: 'request:fail timeout' })]) {
  reset(); respond = response;
  const promise = cos.uploadCosFile({ credential: presigned, filePath: '/synthetic/a.jpg', headers });
  if (response === success) await promise;
  else await assert.rejects(promise);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'PUT');
  assert.equal(requests[0].header['x-cos-forbid-overwrite'], 'true');
}
// Wrong/duplicate keys are rejected before reading or writing any file.
for (const invalid of [[{ ...files[0], objectKey: 'not-allocated' }], [files[0], files[0]]]) {
  reset();
  await assert.rejects(cos.uploadCosFilesBatch(credential, invalid));
  assert.equal(requests.length, 0);
  assert.equal(reads.length, 0);
}
// Exercise the existing ordinary media workflow against this same COS boundary.
let allocations = 0;
const media = {};
vm.runInNewContext(compile('actions/media.ts'), {
  exports: media,
  require: (name) => {
    if (name === '../utils/cos') return cos;
    if (name === '../services/media') return { getUploadCredential: async () => {
      allocations++;
      return credential;
    } };
    if (name === '../utils/constants') return { MEDIA_TYPES: { IMAGE: { value: 'IMAGE' } } };
    if (name === '../utils/wx-promise') return {};
    throw new Error(`Unexpected dependency ${name}`);
  },
});
const selected = files.map((x) => ({ filePath: x.filePath, originalName: 'image.jpg' }));
respond = reject409;
await assert.rejects(media.uploadFilesToCos('POST', selected));
assert.equal(allocations, 1); // No fallback allocation or unsafe transport retry in the action.
respond = success;
const items = await media.uploadFilesToCos('USER', selected);
assert.equal(items.length, 3);
assert.deepEqual(Array.from(items, (x) => x.objectKey), credential.objectKeys);
console.log('PASS file foundation: default/batch/presigned PUT, required headers, thresholds, failures and ordinary media mapping. COS policy, backend retention and device NOT_RUN.');
