import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root=path.resolve(import.meta.dirname,'..');
const requests=[],downloads=[],opened=[],removed=[],navigations=[],listeners=new Set();
const clone=v=>JSON.parse(JSON.stringify(v));
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const request=(kind,args)=>new Promise((resolve,reject)=>requests.push({kind,args,resolve,reject}));
const take=kind=>{const index=requests.findIndex(r=>r.kind===kind);assert.ok(index>=0,'Missing '+kind);return requests.splice(index,1)[0];};
const closeOperations=[];
let metadataFailure=false, metadataForeign=false, metadataVideo=false, closeConfirmed=true;
const application=(id,status='PENDING')=>({applicationId:id,status,title:'志愿服务',description:'申请说明',createdAt:'2026-10-26T01:00:00Z',fileIds:['file-1'],acceptanceBasis:{organizationId:'org',membershipId:'cycle'},accounting:{status:status==='APPROVED'?'EFFECTIVE':'NONE',effectivePoints:status==='APPROVED'?7:0}});
const wx={
  navigateTo:o=>navigations.push(o),canIUse:()=>true,
  getFileSystemManager:()=>({unlink:o=>removed.push(o.filePath)}),
  openDocument:o=>{opened.push(o);o.success();},
  previewMedia:o=>{opened.push(o);o.success();},
};
const api={
  listMyPointApplications:q=>request('list',q),getMyPointApplication:id=>request('detail',id),
  getMyPointFile:async fileId=>{
    if(metadataFailure)throw new Error('No material access');
    return{fileId,fileName:metadataVideo?'材料.mp4':'材料.pdf',applicationId:metadataForeign?'other':'id/1',kind:metadataVideo?'VIDEO':'PDF',contentType:metadataVideo?'video/mp4':'application/pdf'};
  },
  getMyPointFileAccess:id=>request('access',id),
  pointId:id=>{if(typeof id!=='string'||!id.length)throw new Error('Bad id');return id;},
  pointsErrorMessage:e=>e.message,
};
const errors = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'utils/error.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:errors});
const mocks={
  '../../../utils/error': errors,
  '../../../services/person-binding':{watchPersonBinding:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}},
  '../../services/points':api,
  '../../services/points-operation': { pointCloseOperation: (id, body) => {
    const op={id,body:clone(body),state:'READY',async submit(){this.state='SUBMITTING';try{const result=await request('close',{id,body});this.state='CONFIRMED';return result;}catch(e){this.state='UNKNOWN';throw e;}}};
    closeOperations.push(op);return op;
  } },
  '../../../utils/wx-promise':{
    wxDownloadFile:o=>new Promise((resolve,reject)=>downloads.push({options:o,resolve,reject})),
    wxPreviewImage:async o=>opened.push(o),
    wxShowModal:async()=>({confirm:closeConfirmed}),
  },
};
const state={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'subpkg_user/services/points-state.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:state});
mocks['../../services/points-state']=state;
function load(relative){let definition;const source=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:false}}).outputText;
  vm.runInNewContext(source,{exports:{},wx,Error,require:name=>name==='../../../utils/definePage'?{default:d=>{definition=d;}}:mocks[name]});return definition;}
function page(definition,query={}){const p={...definition,data:clone(definition.data),setData(patch){Object.assign(this.data,patch);}};p.onLoad(query);p.onShow();return p;}
const listDefinition=load('subpkg_user/pages/points-applications/index.ts');
const list=page(listDefinition);
let r=take('list');assert.deepEqual(clone(r.args),{page:1,pageSize:20});r.resolve({items:[application('id/1'),application('b','REJECTED')],page:1,pageSize:20,totalItems:25});await flush();
assert.equal(list.data.rows[1].statusLabel,'已驳回');assert.equal(list.data.hasMore,true);
list.open({currentTarget:{dataset:{id:'id/1'}}});assert.match(navigations.pop().url,/applicationId=id%2F1$/);
list.open({currentTarget:{dataset:{id:'injected'}}});assert.equal(navigations.length,0);
let pending=list.more();const same=list.more();r=take('list');assert.equal(r.args.page,2);r.reject(new Error('network'));await Promise.all([pending,same]);
assert.equal(list.data.rows.length,2);assert.equal(list.data.page,1);assert.equal(list.data.moreError,'network');
pending=list.more();r=take('list');assert.equal(r.args.page,2);r.resolve({items:[application('b','APPROVED'),application('c')],page:2,pageSize:20,totalItems:25});await pending;
assert.equal(list.data.rows.length,3);assert.equal(list.data.rows[1].statusLabel,'已通过');assert.equal(list.data.hasMore,false);
pending=list.refresh();const old=take('list');list.filterChanged({detail:{value:'2'}});r=take('list');assert.equal(r.args.status,'APPROVED');
r.resolve({items:[application('new','APPROVED')],page:1,pageSize:20,totalItems:1});await flush();old.resolve({items:[application('stale')],page:1,pageSize:20,totalItems:1});await pending;
assert.equal(list.data.rows[0].applicationId,'new');
for(const fn of listeners)fn();assert.equal(list.data.rows.length,0);r=take('list');r.resolve({items:[],page:1,pageSize:20,totalItems:0});await flush();assert.equal(list.data.error,'');
list.onHide();list.onShow();r=take('list');r.reject(new Error('当前人员无权访问'));await flush();assert.equal(list.data.error,'当前人员无权访问');assert.equal(list.data.rows.length,0);list.onUnload();assert.equal(listeners.size,0);

const detailDefinition=load('subpkg_user/pages/points-application/index.ts');
const invalid=page(detailDefinition);assert.match(invalid.data.error,/标识无效/);assert.equal(requests.length,0);invalid.onUnload();
const detail=page(detailDefinition,{applicationId:'id/1'});r=take('detail');assert.equal(r.args,'id/1');r.resolve({...application('id/1','APPROVED'),awardedPoints:7,reviewNote:'审核通过'});await flush();
assert.equal(detail.data.statusLabel,'已通过');assert.equal(detail.data.materials[0].available,true);assert.equal(detail.data.materials[0].fileType,'pdf');
pending=detail.preview({currentTarget:{dataset:{id:'file-1'}}});r=take('access');r.resolve({url:'https://private.invalid/object?signed-secret',expiresAt:'2099-01-01T00:00:00Z'});await flush();
let download=downloads.shift();assert.equal(download.options.header.Authorization,undefined);assert.equal(download.options.header['Cache-Control'],'no-store');
assert.ok(!JSON.stringify(detail.data).includes('signed-secret'));download.resolve({statusCode:200,tempFilePath:'/tmp/private-proof'});await pending;
assert.equal(opened.at(-1).fileType,'pdf');assert.equal(opened.at(-1).showMenu,false);
detail.onHide();assert.ok(detail.data.detail);detail.onShow();assert.ok(removed.includes('/tmp/private-proof'));r=take('detail');r.resolve(application('id/1'));await flush();
// A denied access signature cannot become a public download.
pending=detail.preview({currentTarget:{dataset:{id:'file-1'}}});r=take('access');r.reject(new Error('403'));await pending;assert.equal(downloads.length,0);assert.ok(detail.data.feedback);
// A stale private download is deleted instead of opened after binding/account change.
pending=detail.preview({currentTarget:{dataset:{id:'file-1'}}});r=take('access');r.resolve({url:'https://private.invalid/short',expiresAt:'2099-01-01T00:00:00Z'});await flush();download=downloads.shift();
for(const fn of listeners)fn();assert.equal(detail.data.detail,null);r=take('detail');r.resolve(application('id/1'));await flush();
const before=opened.length;download.resolve({statusCode:200,tempFilePath:'/tmp/stale-proof'});await pending;assert.equal(opened.length,before);assert.ok(removed.includes('/tmp/stale-proof'));
metadataFailure=true;pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;assert.ok(detail.data.detail);assert.equal(detail.data.materials[0].available,false);metadataFailure=false;
metadataForeign=true;pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;assert.equal(detail.data.materials[0].available,false);metadataForeign=false;
metadataVideo=true;pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;assert.equal(detail.data.materials[0].kind,'VIDEO');assert.equal(detail.data.materials[0].fileType,undefined);
pending=detail.preview({currentTarget:{dataset:{id:'file-1'}}});r=take('access');r.resolve({url:'https://private.invalid/video?video-signed-secret',expiresAt:'2099-01-01T00:00:00Z'});await flush();download=downloads.shift();assert.equal(download.options.header.Authorization,undefined);download.resolve({statusCode:200,tempFilePath:'/tmp/private-video'});await pending;assert.equal(opened.at(-1).sources[0].type,'video');assert.equal(opened.at(-1).sources[0].url,'/tmp/private-video');assert.equal(opened.at(-1).showmenu,false);assert.ok(!JSON.stringify(detail.data).includes('video-signed-secret'));detail.onHide();detail.onShow();assert.ok(removed.includes('/tmp/private-video'));r=take('detail');r.resolve(application('id/1'));await flush();metadataVideo=false;
// Closing is available for PENDING without a current acceptance candidate/eligibility read.
assert.equal(detail.data.canClose,true);
await detail.closeApplication();assert.match(detail.data.closeFeedback,/理由/);assert.equal(closeOperations.length,0);
detail.inputCloseReason({detail:{value:'原周期失效'}});
closeConfirmed=false;await detail.closeApplication();assert.equal(closeOperations.length,0);assert.equal(detail.data.closeReason,'原周期失效');assert.equal(detail.data.closing,false);
closeConfirmed=true;pending=detail.closeApplication();const duplicate=detail.closeApplication();await flush();r=take('close');assert.equal(r.args.body.reason,'原周期失效');
r.reject(new Error('timeout'));await Promise.all([pending,duplicate]);assert.equal(detail.data.closeUnknown,true);
detail.inputCloseReason({detail:{value:'不能改'}});assert.equal(detail.data.closeReason,'原周期失效');
pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;assert.equal(detail.data.closeUnknown,true);
pending=detail.closeApplication();r=take('close');assert.equal(closeOperations.length,1);r.resolve({...application('id/1','APPROVED'),awardedPoints:7,accounting:{status:'EFFECTIVE',effectivePoints:3}});await pending;
assert.equal(detail.data.statusLabel,'已通过');assert.match(detail.data.closeFeedback,/未结束/);assert.equal(detail.data.canClose,false);
assert.match(detail.data.ledgerUrl,/applicationId=id%2F1$/);
pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;
detail.inputCloseReason({detail:{value:'结束申请'}});pending=detail.closeApplication();await flush();r=take('close');r.resolve({...application('id/1','CLOSED'),closureReason:'结束申请'});await pending;
assert.equal(detail.data.statusLabel,'本人已结束');assert.equal(detail.data.closeUnknown,false);
// A temporary background hide preserves the same unresolved close intent.
pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;
detail.inputCloseReason({detail:{value:'保留原结束操作'}});pending=detail.closeApplication();await flush();r=take('close');
const beforeHide=closeOperations.length;detail.onHide();r.reject(new Error('timeout while hidden'));await pending;
detail.onShow();r=take('detail');r.resolve(application('id/1'));await flush();assert.equal(detail.data.closeUnknown,true);assert.equal(detail.data.closing,false);
pending=detail.closeApplication();r=take('close');assert.equal(closeOperations.length,beforeHide);r.resolve(application('id/1','CLOSED'));await pending;
// Binding change discards the intent and a late mutation result.
pending=detail.refresh();r=take('detail');r.resolve(application('id/1'));await pending;
detail.inputCloseReason({detail:{value:'旧人员理由'}});pending=detail.closeApplication();await flush();const oldClose=take('close');
for(const fn of listeners)fn();r=take('detail');r.resolve(application('id/1'));await flush();
oldClose.resolve(application('id/1','CLOSED'));await pending;assert.equal(detail.data.detail.status,'PENDING');assert.equal(detail.data.closeReason,'');assert.equal(detail.data.closing,false);
pending=detail.refresh();r=take('detail');r.reject(new errors.HttpError(403,'申请不存在或无权访问'));await pending;assert.equal(detail.data.detail,null);assert.match(detail.data.error,/无权访问/);
pending=detail.refresh();r=take('detail');detail.onUnload();r.resolve(application('id/1'));await pending;assert.equal(detail.data.detail,null);assert.equal(listeners.size,0);
// The same ledger Page scopes requests to one application and never substitutes a global summary.
mocks['../../../actions/current-user']={getCurrentIdentity:()=>({id:'user-1'}),watchCurrentIdentity:()=>()=>{}};
mocks['../../../services/person-binding'].getMyPersonBinding=async()=>({state:'BOUND',personStatus:'ACTIVE'});
api.listMyPointLedger=q=>request('ledger',q);api.getMyPointSummary=()=>request('summary');
const ledgerDefinition=load('subpkg_user/pages/person-points/index.ts');
const scoped=page(ledgerDefinition,{applicationId:'id/1'});await flush();r=take('ledger');assert.equal(r.args.applicationId,'id/1');
r.resolve({items:[{ledgerId:'original',kind:'GRANT',pointsDelta:7},{ledgerId:'reversal',kind:'REVERSAL',pointsDelta:-7},{ledgerId:'correction',kind:'CORRECTION_GRANT',pointsDelta:3}],pageSize:20,totalItems:21});await flush();
assert.equal(scoped.data.summary,null);assert.equal(scoped.data.ledger[2].kind,'CORRECTION_GRANT');assert.equal(scoped.data.hasMore,true);
pending=scoped.more();await flush();r=take('ledger');assert.equal(r.args.applicationId,'id/1');assert.equal(r.args.page,2);r.resolve({items:[{ledgerId:'final-reversal',kind:'REVERSAL',pointsDelta:-3}],pageSize:20,totalItems:21});await pending;
assert.equal(scoped.data.ledger.reduce((sum,row)=>sum+row.pointsDelta,0),0);
for(const fn of listeners)fn();assert.equal(scoped.data.ledger.length,0);await flush();r=take('ledger');r.reject(new Error('当前绑定无权读取'));await flush();assert.equal(scoped.data.summary,null);assert.equal(scoped.data.ledger.length,0);scoped.onUnload();
assert.equal(requests.length,0);assert.equal(downloads.length,0);
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'))),routes=app.subPackages.find(p=>p.root==='subpkg_user').pages;
for(const route of ['points-application','points-applications'])assert.ok(routes.includes('pages/'+route+'/index'));
assert.match(fs.readFileSync(path.join(root,'subpkg_user/pages/points-apply/index.wxml'),'utf8'),/bindtap="openResult"/);
console.log('PASS Points r6 records Pages: close/recovery/review race/background preservation, scoped correction ledger, pagination/filter races/retry, binding cleanup, authorized private preview and temporary-file cleanup. Node simulation; Backend/device NOT_RUN.');

