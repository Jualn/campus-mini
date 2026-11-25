import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
let definition, eligible = { eligible: true }, organizations = [{ organizationId: 'org-1', name: '服务端组织', membershipId: 'cycle-1' }];
let selected = [{ name: 'proof.pdf', path: '/tmp/proof.pdf', size: 100 }];
let identity = { id: 'user-1' }, failUpload = false, applicationAttempts = 0;
let failApplication = true, readError = null, deferredEligibility = null, pendingSubmit = null;
const bindings = new Set(), identities = new Set(), bodies = [], materialOperations = [], applicationOperations = [];
const redirected=[];
const clone = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
const mocks = {
  '../../../services/business-subscriptions': { createBusinessSubscription: () => ({ prepare: async () => {}, request: async () => true, dispose() {}, pending: false }) },
  '../../../utils/leave-guard': { createLeaveGuard: () => Object.assign(() => {}, { resume() {} }) },
  '../../../utils/definePage': { default: d => { definition=d; } },
  '../../../utils/wx-promise': { chooseMessageFile: async () => selected },
  '../../../services/person-binding': { watchPersonBinding: fn => { bindings.add(fn); return () => bindings.delete(fn); } },
  '../../../actions/current-user': { getCurrentIdentity: () => identity, watchCurrentIdentity: fn => { identities.add(fn); return () => identities.delete(fn); } },
  '../../services/points': {
    getMyPointsEligibility: async () => { if(deferredEligibility) return deferredEligibility; if(readError) throw readError; return eligible; },
    listMyPointAcceptingOrganizations: async () => ({items:organizations}),
    fileDeclaration: value => value, pointsErrorMessage: e => e.message,
  },
  '../../services/points-operation': {
    pointFileUploadOperation: declaration => {
      const operation={ declaration, calls:0, async upload() { this.calls++; if(failUpload) throw new Error('私有材料暂不可用'); return {fileId:'private-'+materialOperations.indexOf(operation)}; } };
      materialOperations.push(operation); assert.ok(['PDF','VIDEO'].includes(declaration.kind)); return operation;
    },
    pointApplicationOperation: body => {
      bodies.push(clone(body));
      const operation={state:'READY', async submit() { applicationAttempts++; if(pendingSubmit) return pendingSubmit;
        if(failApplication) { this.state='UNKNOWN'; throw new Error('提交超时'); }
        this.state='CONFIRMED'; return {applicationId:'application-1',status:'PENDING',title:body.title}; } };
      applicationOperations.push(operation); return operation;
    },
  },
};
const stateCode=ts.transpileModule(fs.readFileSync(path.join(root,'subpkg_user/services/points-state.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const state={}; vm.runInNewContext(stateCode,{exports:state}); mocks['../../services/points-state']=state;
const code=ts.transpileModule(fs.readFileSync(path.join(root,'subpkg_user/pages/points-apply/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:false}}).outputText;
vm.runInNewContext(code,{exports:{},require:name=>mocks[name],wx:{redirectTo:o=>redirected.push(o),canIUse:()=>true,enableAlertBeforeUnload(){ /* no native navigation in simulation */ },disableAlertBeforeUnload(){ /* no native navigation in simulation */ }},Error});
function page() { const p={...definition,data:clone(definition.data),_materials:[],setData(patch){Object.assign(this.data,patch);}};p.onLoad();return p; }
const p=page(); await flush(); assert.equal(p.data.eligible,true); assert.equal(p.data.organizationIndex,0);
await p.submit(); assert.equal(applicationOperations.length,0); assert.match(p.data.feedback,/请填写/);assert.ok(p.data.titleError);assert.ok(p.data.descriptionError);assert.ok(p.data.materialError);
p.inputTitle({detail:{value:'志愿服务'}});p.inputDescription({detail:{value:'服务说明'}});
selected=[{name:'proof.avi',path:'/tmp/a',size:100}]; await p.chooseFile(); assert.equal(p.data.files.length,0);
selected=[{name:'proof.pdf',path:'/tmp/a',size:10485761}]; await p.chooseFile(); assert.equal(p.data.files.length,0);
selected=[{name:'proof.pdf',path:'/tmp/a',size:100}]; await p.chooseFile(); assert.equal(p.data.files.length,1);
failUpload=true;await p.submit();assert.equal(applicationOperations.length,0);assert.equal(p.data.result,null);
assert.match(p.data.feedback,/材料/); failUpload=false;
const first=p.submit(), duplicate=p.submit(); await Promise.all([first,duplicate]);
assert.equal(applicationAttempts,1);assert.equal(applicationOperations.length,1);assert.equal(materialOperations[0].calls,2);
assert.equal(p.data.unknown,true);assert.equal(p.data.locked,true);assert.equal(p.data.result,null);
assert.deepEqual(bodies[0],{title:'志愿服务',description:'服务说明',acceptingOrganizationId:'org-1',fileIds:['private-0']});
p.inputTitle({detail:{value:'不能改'}});p.removeFile({currentTarget:{dataset:{index:0}}});
assert.equal(p.data.title,'志愿服务');assert.equal(p.data.files.length,1);
failApplication=false;await p.submit();assert.equal(applicationOperations.length,1);assert.equal(materialOperations[0].calls,2);
assert.equal(p.data.result.status,'PENDING');assert.equal(p.data.unknown,false);await p.submit();assert.equal(applicationAttempts,2);
p.openResult();assert.match(redirected[0].url,/points-application\/index\?applicationId=application-1$/);
p.onUnload();assert.equal(bindings.size,0);assert.equal(identities.size,0);
organizations=[organizations[0],{organizationId:'org-2',name:'另一服务端组织',membershipId:'cycle-2'}];
const multiple=page();await flush();assert.equal(multiple.data.organizationIndex,-1);
multiple.chooseOrganization({detail:{value:'1'}});assert.equal(multiple.data.organizationIndex,1);
multiple.inputTitle({detail:{value:'保留草稿'}});organizations=[organizations[0]];await multiple.refresh();
assert.equal(multiple.data.organizations.length,1);assert.equal(multiple.data.organizationIndex,0);assert.equal(multiple.data.title,'保留草稿');
multiple.onUnload();organizations=[];const empty=page();await flush();assert.equal(empty.data.eligible,false);assert.match(empty.data.notice,/组织/);empty.onUnload();
eligible={eligible:false,reason:'NO_BINDING'};const unbound=page();await flush();assert.equal(unbound.data.eligible,false);assert.match(unbound.data.notice,/关联/);unbound.onUnload();
eligible={eligible:true};readError=new Error('资格不可确认');const failed=page();await flush();assert.equal(failed.data.eligible,false);assert.match(failed.data.error,/资格/);failed.onUnload();readError=null;
let resolve;deferredEligibility=new Promise(r=>{resolve=r;});const stale=page();stale.onUnload();resolve({eligible:true});await flush();assert.equal(stale.data.eligible,false);deferredEligibility=null;
organizations=[{organizationId:'org-1',name:'服务端组织',membershipId:'cycle-1'}];const changed=page();await flush();
changed.inputTitle({detail:{value:'旧人员草稿'}});for(const fn of bindings) fn();await flush();assert.equal(changed.data.title,'');assert.equal(changed.data.files.length,0);
identity={id:'other'};for(const fn of identities) fn();await flush();assert.equal(changed.data.title,'');changed.onUnload();
selected=[{name:'proof.mp4',path:'/tmp/proof.mp4',size:10485760}];const video=page();await flush();await video.chooseFile();assert.equal(video.data.files.length,1);assert.equal(materialOperations.at(-1).declaration.kind,'VIDEO');assert.equal(materialOperations.at(-1).declaration.contentType,'video/mp4');video.onUnload();
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json')));assert.ok(app.subPackages.find(p=>p.root==='subpkg_user').pages.includes('pages/points-apply/index'));
const meTemplate=fs.readFileSync(path.join(root,'pages/me/me.wxml'),'utf8');
const meSource=fs.readFileSync(path.join(root,'pages/me/me.ts'),'utf8');
assert.match(meTemplate,/wx:for="{{functionEntries}}"/);
assert.match(meSource, /key: 'points',\s*label: '我的积分',[\s\S]*?url: '\/subpkg_user\/pages\/person-points\/index',/);
assert.doesNotMatch(meSource, /pages\/points-(apply|applications)\/index/);
const ledgerTemplate = fs.readFileSync(path.join(root, 'subpkg_user/pages/person-points/index.wxml'), 'utf8');
assert.match(ledgerTemplate, /url="\/subpkg_user\/pages\/points-apply\/index"/);
assert.match(ledgerTemplate, /url="\/subpkg_user\/pages\/points-applications\/index"/);
const applicationsTemplate = fs.readFileSync(path.join(root, 'subpkg_user/pages/points-applications/index.wxml'), 'utf8');
assert.doesNotMatch(applicationsTemplate, /url="\/subpkg_user\/pages\/person-points\/index"/);
console.log('PASS Points application Page: native entry, eligibility/org states, private material mapping, upload failure, duplicate submit, UNKNOWN handle reuse, success, unload and binding/account invalidation. Node simulation only.');

organizations=[{organizationId:'one',name:'一'},{organizationId:'two',name:'二'}];
const stableOrganization=page();await flush();stableOrganization.chooseOrganization({detail:{value:'1'}});
organizations=[organizations[1],organizations[0]];await stableOrganization.refresh();
assert.equal(stableOrganization.data.organizations[stableOrganization.data.organizationIndex].organizationId,'two');
stableOrganization.onUnload();
console.log('PASS eligibility refresh preserves organization identity across reordering');
