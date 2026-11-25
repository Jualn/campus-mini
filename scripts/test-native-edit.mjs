// Actual domain services -> API -> shared request -> synthetic wx transport. No provider writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..'), requests=[], authentication=[];
let recoveries=0;
const mocks=new Map(),cache=new Map();
const mock=(p,value)=>mocks.set(path.resolve(root,p),value);
mock('config/index.ts',{default:{baseURL:'https://example.invalid',timeout:1000}});
mock('utils/logger.ts',{createLogger:()=>({info(){},warn(){},error(){}})});
mock('utils/wx-promise.ts',{wxShowLoading(){},wxHideLoading(){}});
mock('utils/auth-transport.ts',{
  getAuthToken:async(mode,retry)=>{authentication.push({mode,retry});return 'synthetic-current-session';},
  recoverAuthToken:async()=>{recoveries++;},
});
mock('utils/transfer.ts',{});mock('utils/stream.ts',{});
mock('utils/notify.ts',{getErrorMessage:e=>e.userMessage??e.message});
const wx={request:o=>requests.push(o)};
function load(file){
  file=path.resolve(root,file);if(mocks.has(file))return mocks.get(file);if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:false}}).outputText;
  vm.runInNewContext(code,{exports,wx,require:n=>load(path.resolve(path.dirname(file),n+'.ts'))},{filename:file});return exports;
}
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const plain=x=>JSON.parse(JSON.stringify(x));
const post=load('services/post.ts'),growth=load('subpkg_user/services/growth-record.ts');
const boundary=load('utils/request.ts'),errors=load('utils/error.ts');
const body={title:null,content:'draft',topicIds:[]};
for(const type of ['NORMAL','MENTOR_QA']){
  const p=post.editPost('p/a',body,'"before"');await flush();const req=requests.shift();
  assert.equal(req.method,'POST');assert.equal(req.url,'https://example.invalid/v1/post/p%2Fa:edit');
  assert.equal(req.header['If-Match'],'"before"');assert.deepEqual(plain(req.data),body);
  assert.equal(Object.hasOwn(req.data,'categoryId'),false,'omitted fields remain omitted');
  assert.equal(req.header['X-HTTP-Method-Override'],undefined);
  req.success({statusCode:200,header:{ETag:'"after"'},data:{id:'p/a',postType:type}});
  const result=await p;assert.equal(result.headers.etag,'"after"');assert.equal(result.data.postType,type);
}
const edit={title:null,content:'growth draft',mediaIds:['media-1']};
const pending=growth.editGrowth('g/a',edit,'"growth-before"');await flush();let req=requests.shift();
assert.equal(req.method,'POST');assert.equal(req.url,'https://example.invalid/v1/post/g%2Fa:edit');
assert.equal(req.header['If-Match'],'"growth-before"');assert.deepEqual(plain(req.data),edit);
const saved={postId:'g/a',personId:'person',organizationId:'branch',recordType:'GROWTH',title:null,content:'growth draft',mediaIds:['media-1'],categoryId:null,topicIds:[]};
req.success({statusCode:200,header:{ETag:'"growth-after"'},data:saved});
assert.equal((await pending).etag,'"growth-after"');
for(const status of [400,401,403,404,409,412,422,428,503]){
  const p=post.editPost('p',body,'"before"');await flush();req=requests.shift();
  req.success({statusCode:status,header:{},data:{type:'/problems/revision-mismatch'}});
  await assert.rejects(p,e=>e instanceof errors.HttpError||e instanceof errors.AuthError);
  assert.equal(requests.length,0,'error cannot trigger another path, verb or an automatic replay');
}
const unknown=growth.editGrowth('g',edit,'"before"');await flush();requests.shift().fail({errMsg:'request:fail timeout'});
await assert.rejects(unknown,e=>e instanceof errors.NetworkError&&/未确认/.test(e.userMessage));
assert.equal(requests.length,0);assert.equal(recoveries,0);
assert.ok(authentication.every(a=>a.retry===false),'both edit domains require stable credentials');
await assert.rejects(boundary.httpWithMeta.patch('/v1/post/p',body),/编辑服务暂不可用/);
assert.equal(requests.length,0,'the transport does not globally tunnel unsupported PATCH');
console.log('PASS native edit: real Post/NORMAL/QA and Growth services use formal POST :edit, exact If-Match/presence/response ETag, errors and unknown results never replay/fallback, generic PATCH stays blocked. Synthetic wx only.');
