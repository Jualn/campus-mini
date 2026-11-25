import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { setTimeout, clearTimeout } from 'node:timers';
const root = path.resolve(import.meta.dirname, '..');
const environmentCode = ts.transpileModule(fs.readFileSync(path.join(root, 'config/index.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
for (const envVersion of ['develop', 'trial', 'release']) {
  const configExports = {};
  vm.runInNewContext(environmentCode, {
    exports: configExports,
    wx: { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) },
  });
  assert.equal(configExports.default.baseURL, envVersion === 'release' ? 'https://api.jualn.cn' : 'https://test.jualn.cn');
}
const requests = [];
let size = 100;
const wx = {
  canIUse: () => false,
  getStorageSync: () => undefined,
  setStorageSync() { /* SDK cache is not persisted in this test. */ },
  getSystemInfoSync: () => ({ SDKVersion: '3.0.0' }),
  getFileSystemManager: () => ({ readFile: options => options.success({ data: new ArrayBuffer(size) }) }),
  request: options => {
    requests.push(options);
    options.success({ statusCode: 200, header: { etag: 'test-etag' }, data: '' });
    return { onProgressUpdate() { /* Test uses immediate successful transport. */ } };
  },
};
const module = { exports: {} };
try {
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram_npm/cos-wx-sdk-v5/index.js'), 'utf8'), {
    module, exports: module.exports, wx, window: {}, setTimeout, clearTimeout, ArrayBuffer, Uint8Array,
  });
} catch (error) { throw new Error('Bundled SDK initialization: ' + error.message, { cause: error }); }
const COS = module.exports;
const exports = {};
const source = ts.transpileModule(fs.readFileSync(path.join(root, 'utils/cos.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(source, { exports, wx, ArrayBuffer, require: name => {
  if (name.includes('cos-wx-sdk')) return COS;
  if (name === './logger') return { createLogger: () => ({ error() { /* No logging in success path. */ } }) };
  throw new Error('Unexpected dependency ' + name);
} });
const credential = { bucket: 'private-1250000000', region: 'ap-guangzhou', objectKeys: ['points/temp/proof'], tmpSecretId: 'synthetic-id', tmpSecretKey: 'synthetic-key', sessionToken: 'synthetic-token', expiredTime: Math.floor(Date.now() / 1000) + 600 };
// Verify exact PUT below and above SDK default multipart threshold, up to the Points limit.
for (size of [100, 1048577, 10485760]) {
  requests.length = 0;
  await exports.uploadCosFile({ credential, filePath: '/tmp/proof.pdf', contentType: 'application/pdf', singlePut: true, headers: { 'x-cos-acl': 'private', 'x-cos-forbid-overwrite': 'true' } });
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.method, 'PUT');
  assert.equal(request.data.byteLength, size);
  assert.equal(request.header['Content-Type'], 'application/pdf');
  assert.equal(request.header['x-cos-acl'], 'private');
  assert.equal(request.header['x-cos-forbid-overwrite'], 'true');
  assert.equal(request.header['x-cos-security-token'], credential.sessionToken);
  assert.ok(request.header.Authorization || request.header.authorization);
}
console.log('PASS real bundled COS SDK exact single PUT with synthetic wx transport, including 10MiB; real COS/device NOT_RUN.');
size=100;
for (const environment of ['test', 'prod']) for (const visibility of ['public', 'private']) {
  requests.length=0;
  const bucket=`jualn-campus-${environment}-${visibility}-1356013274`;
  await exports.uploadCosFile({credential:{...credential,bucket,region:'ap-nanjing'},filePath:'/tmp/synthetic-proof.pdf',contentType:'application/pdf',singlePut:true});
  assert.equal(new URL(requests[0].url).hostname,`${bucket}.cos.ap-nanjing.myqcloud.com`);
}
console.log('PASS develop/trial use test API, release uses production API; all four upload targets follow server-issued credentials. Synthetic transport only.');
