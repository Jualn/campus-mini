// Real Node HTTP -> existing Spring full app -> real MySQL/Redis/Person/Points owners.
// wx runtime/auth transport are shims; Backend's explicit external WeChat/COS/safety doubles remain doubles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.MINI_POINTS_TEST_BASE;
assert.match(base ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
const output = process.argv[2];
assert.ok(output);
let token = process.env.MINI_POINTS_TEST_TOKEN;
let identity = { id: process.env.MINI_POINTS_TEST_USER };
let loseNextApplicationResponse = false;
assert.ok(token && identity.id);
const evidence = { boundary: 'REAL_BACKEND_HTTP', backend: 'Existing PointsIntegrationHttpTest full Spring application fixture', contractRevision: 'points-v1-r3', externalProviders: 'WeChat/COS/STS/content safety are Backend fixture doubles; no actual COS upload/download', wechatRuntime: 'NOT_RUN', operations: {}, requests: [] };
const watchers = [], cache = new Map();
const mocks = new Map([
  ['config/index.ts', { baseURL: base, timeout: 15000 }],
  ['utils/logger.ts', { createLogger: () => ({ info() { /* no private payload logging */ } }) }],
  ['utils/auth-transport.ts', { getAuthToken: async (mode, retry) => { assert.equal(mode, 'required'); assert.equal(retry, false); return token; }, recoverAuthToken: () => { throw new Error('Must not reauthenticate/replay'); } }],
  ['utils/wx-promise.ts', {}], ['utils/transfer.ts', {}], ['utils/stream.ts', {}],
  ['utils/cos.ts', { uploadCosFile: () => { throw new Error('Real COS is intentionally NOT_RUN in this HTTP fixture'); } }],
  ['actions/current-user.ts', { getCurrentIdentity: () => identity, watchCurrentIdentity: fn => watchers.push(fn) }],
]);
const wx = { request(options) {
  const endpoint = new URL(options.url);
  if(options.method === 'GET' && options.data) for(const [k,v] of Object.entries(options.data)) endpoint.searchParams.set(k,String(v));
  const request = http.request(endpoint,{ method: options.method, headers: options.header }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      evidence.requests.push({ method: options.method, path: endpoint.pathname, status: response.statusCode, cacheControl: response.headers['cache-control'] });
      if(loseNextApplicationResponse && options.method==='POST' && endpoint.pathname.endsWith('/points/applications') && response.statusCode===201) {
        loseNextApplicationResponse=false;
        evidence.requests.at(-1).responseLostAfterRealCommit=true;
        options.fail({errMsg:'Controlled client response loss after real Backend commit'});
        return;
      }
      options.success({ statusCode: response.statusCode, data: body, header: response.headers });
    });
  });
  request.on('error', error => options.fail({ errMsg: error.message }));
  request.setTimeout(options.timeout, () => request.destroy(new Error('request timeout')));
  if(options.method !== 'GET' && options.data !== undefined) request.write(JSON.stringify(options.data));
  request.end();
} };
function load(relative) {
  relative = relative.replaceAll('\\','/');
  if(mocks.has(relative)) return mocks.get(relative);
  if(cache.has(relative)) return cache.get(relative);
  const filename = path.join(root,relative), exports = {};
  cache.set(relative,exports);
  const code = ts.transpileModule(fs.readFileSync(filename,'utf8'),{ compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code,{ exports, require: name => load(path.relative(root,path.resolve(path.dirname(filename),name+'.ts'))), wx, Date, Math, Error, Set, Map },{ filename });
  return exports;
}
const api = load('subpkg_user/services/points.ts');
const operations = load('subpkg_user/services/points-operation.ts');
const { HttpError } = load('utils/error.ts');
const record = (name, detail = 'PASS') => { evidence.operations[name] = detail; };
try {
  assert.equal((await api.getMyPointsEligibility()).eligible,true); record('getMyPointsEligibility');
  // Require the new Provider before any upload/mutation. The old fixture is not r3 READY.
  const candidates = await api.listMyPointAcceptingOrganizations();
  assert.equal(candidates.items.length, 1, 'Fixture must explicitly supply exactly one authorized acceptance option');
  const acceptingOrganizationId = candidates.items[0].organizationId;
  record('listMyPointAcceptingOrganizations');
  assert.equal((await api.getMyPointSummary()).balance,0); record('getMyPointSummary');
  assert.equal((await api.listMyPointApplications()).items.length,0); record('listMyPointApplications');
  assert.equal((await api.listMyPointLedger()).items.length,0); record('listMyPointLedger');
  const declaration = { fileName:'mini-http-proof.pdf',kind:'PDF',contentType:'application/pdf',sizeBytes:128 };
  const uploadKey = api.newPointKey();
  const credential = await api.createPointFileUploadCredentials([declaration],uploadKey);
  const replayCredential = await api.createPointFileUploadCredentials([declaration],uploadKey);
  assert.equal(replayCredential.uploadId,credential.uploadId); record('createPointFileUploadCredentials','PASS_HTTP_PROVIDER_DOUBLE');
  // Deliberately no fake PUT: this existing Backend fixture explicitly replaces external object inspection.
  const registrationKey = api.newPointKey();
  const file = await api.registerPointFile(credential.uploadId,0,registrationKey);
  assert.equal((await api.registerPointFile(credential.uploadId,0,registrationKey)).fileId,file.fileId); record('registerPointFile','PASS_HTTP_PROVIDER_DOUBLE');
  assert.equal((await api.getMyPointFile(file.fileId)).fileId,file.fileId); record('getMyPointFile');
  assert.match((await api.getMyPointFileAccess(file.fileId)).url,/^https:\/\//); record('getMyPointFileAccess','PASS_HTTP_PROVIDER_DOUBLE');
  const body = { title:'Mini consumer real HTTP',description:'Synthetic test evidence only',fileIds:[file.fileId], acceptingOrganizationId }, key = api.newPointKey();
  const application = await api.createPointApplication(body,key);
  assert.equal(application.status,'PENDING');
  assert.equal((await api.createPointApplication(body,key)).applicationId,application.applicationId); record('createPointApplication');
  assert.equal((await api.getMyPointApplication(application.applicationId)).status,'PENDING'); record('getMyPointApplication');
  await assert.rejects(api.createPointApplication({ ...body,title:'Changed intent' },key), e => e instanceof HttpError && e.statusCode===409 && e.problemType==='/problems/points-idempotency-conflict');
  // A successful backend operation whose response is lost must still replay the same resource.
  const nextCredential=await api.createPointFileUploadCredentials([declaration],api.newPointKey());
  const nextFile=await api.registerPointFile(nextCredential.uploadId,0,api.newPointKey());
  const nextBody={...body,fileIds:[nextFile.fileId]};
  const unknown=operations.pointApplicationOperation(nextBody);
  loseNextApplicationResponse=true;
  await assert.rejects(unknown.submit(),e=>e.name==='NetworkError'); assert.equal(unknown.state,'UNKNOWN');
  const recovered=await unknown.submit(); assert.equal(unknown.state,'CONFIRMED');
  assert.equal((await unknown.submit()).applicationId,recovered.applicationId);
  assert.equal((await api.listMyPointApplications({pageSize:1})).totalItems,2);
  assert.equal((await api.listMyPointApplications({page:2,pageSize:1})).items.length,1);
  const response=await globalThis.fetch(base+'/v1/admin/points/applications/'+encodeURIComponent(application.applicationId)+'/decisions',{
    method:'POST',headers:{Authorization:'Bearer '+process.env.MINI_POINTS_TEST_REVIEW_TOKEN,'Content-Type':'application/json','Idempotency-Key':api.newPointKey()},
    body:JSON.stringify({decision:'APPROVED',awardedPoints:7,reviewNote:'Synthetic consumer integration approval'}),
  });
  const decisionBody=await response.json();
  evidence.reviewSupport={status:response.status,problemType:decisionBody.type,dependency:decisionBody.dependency};
  assert.equal(response.status,200,JSON.stringify(evidence.reviewSupport));
  assert.equal((await api.getMyPointApplication(application.applicationId)).status,'APPROVED');
  assert.equal((await api.getMyPointSummary()).balance,7);
  const ledger=await api.listMyPointLedger({kind:'GRANT',pageSize:1});
  assert.equal(ledger.totalItems,1); assert.equal(ledger.items[0].pointsDelta,7);
  assert.equal((await api.listMyPointApplications({status:'APPROVED'})).totalItems,1);
  const ownToken=token, ownIdentity=identity;
  token=process.env.MINI_POINTS_TEST_OUTSIDER_TOKEN; identity={id:process.env.MINI_POINTS_TEST_OUTSIDER}; watchers.forEach(fn=>fn());
  for(const call of [()=>api.getMyPointApplication(application.applicationId),()=>api.getMyPointFile(file.fileId),()=>api.getMyPointFileAccess(file.fileId)]) await assert.rejects(call(),e=>e.statusCode===404);
  await assert.rejects(api.getMyPointsEligibility(),e=>e.statusCode===503 && e.problemType==='/problems/points-dependency-unavailable');
  assert.equal((await api.listMyPointApplications()).totalItems,0);
  token=ownToken; identity=ownIdentity; watchers.forEach(fn=>fn());
  token=''; await assert.rejects(api.getMyPointSummary(),e=>e.name==='AuthError'); token=ownToken;
  assert.ok(evidence.requests.every(r=>r.cacheControl?.includes('no-store')));
  evidence.result='PASS';
  console.log('PASS Mini Points HTTP subset: original 10 operations plus r3 acceptance candidates/binding. CLOSED, cycle revocation, new server-denial matrix, external COS/WeChat NOT_RUN; r3 readiness NOT_VERIFIED.');
} catch(error) {
  evidence.result='FAIL'; evidence.failure={name:error.name,message:error.message}; throw error;
} finally { fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n'); }
