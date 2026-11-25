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
    reads.push({ position: o.position, length: o.length });
    o.success({ data: new ArrayBuffer(o.length ?? size) });
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
const credential = { uploadId: 'business-upload', bucket: 'synthetic-1250000000', region: 'ap-nanjing', objectKeys: ['learning/private/video'], tmpSecretId: 'synthetic-id', tmpSecretKey: 'synthetic-key', sessionToken: 'synthetic-token', expiredTime: Math.floor(Date.now() / 1000) + 600 };
const businessCalls = [];
const api = {
  createLearningTaskFileUploadCredentials: async (...args) => { businessCalls.push(['credentials', ...args]); return credential; },
  registerLearningTaskFile: async (...args) => { businessCalls.push(['register', ...args]); return { fileId: 'private-file', kind: 'VIDEO', contentType: 'video/mp4', sizeBytes: size }; },
};
const privateVideo = {};
vm.runInNewContext(compile('subpkg_user/services/private-video-upload.ts'), {
  exports: privateVideo, wx, ArrayBuffer, require: name => {
    if (name.endsWith('/cos')) return cos;
    throw new Error('Unexpected video dependency ' + name);
  },
});
const files = {};
vm.runInNewContext(compile('subpkg_user/services/learning-task-files.ts'), {
  exports: files, wx, ArrayBuffer, require: name => {
    if (name.endsWith('/cos')) return cos;
    if (name === './learning-task') return api;
    if (name === './private-video-upload') return privateVideo;
    throw new Error('Unexpected dependency ' + name);
  },
});
respond = o => {
  const url = new URL(o.url);
  const data = url.searchParams.has('uploads')
    ? '<InitiateMultipartUploadResult><Bucket>synthetic</Bucket><Key>learning/private/video</Key><UploadId>multipart-1</UploadId></InitiateMultipartUploadResult>'
    : o.method === 'POST'
      ? '<CompleteMultipartUploadResult><Location>private</Location><Bucket>synthetic</Bucket><Key>learning/private/video</Key><ETag>done</ETag></CompleteMultipartUploadResult>'
      : '';
  o.success({ statusCode: 200, header: { etag: 'synthetic-part' }, data });
};
for (size of [11 * 1024 * 1024, 200 * 1024 * 1024]) {
  requests.length = 0; reads.length = 0; businessCalls.length = 0;
  const selection = { name: '成果.mp4', path: '/synthetic/video.mp4', size, kind: 'VIDEO', status: '待上传' };
  const result = await files.uploadLearningFile('assignment-1', selection, files.newFileUploadAttempt(), () => {}, () => {});
  assert.equal(result.fileId, 'private-file');
  assert.equal(businessCalls.at(-1)[0], 'register');
  assert.equal(requests[0].method, 'POST'); assert.ok(new URL(requests[0].url).searchParams.has('uploads'));
  assert.equal(requests.at(-1).method, 'POST');
  const parts = requests.slice(1, -1);
  assert.equal(parts.length, Math.ceil(size / (5 * 1024 * 1024)));
  assert.equal(reads.reduce((sum, read) => sum + read.length, 0), size);
  for (let i = 0; i < parts.length; i++) {
    assert.equal(parts[i].method, 'PUT'); assert.equal(new URL(parts[i].url).searchParams.get('partNumber'), String(i + 1));
    assert.ok(parts[i].data.byteLength <= 5 * 1024 * 1024); assert.equal(reads[i].position, i * 5 * 1024 * 1024);
  }
  for (const request of requests) {
    assert.equal(request.header['x-cos-forbid-overwrite'], 'true');
    assert.ok(request.header.Authorization || request.header.authorization);
    assert.equal(request.header['x-cos-security-token'], credential.sessionToken);
    assert.equal(new URL(request.url).pathname, '/learning/private/video');
  }
}
console.log('PASS LearningTask real bundled SDK: 11/200MiB video, bounded 5MiB chunks, protected init/parts/complete, register after completion (synthetic wx; COS/device NOT_RUN).');
