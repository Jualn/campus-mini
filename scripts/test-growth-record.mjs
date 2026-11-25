import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS',name);};
const clone=v=>JSON.parse(JSON.stringify(v));
const calls=[],pages=[],identityWatchers=[],bindingWatchers=[],cosCalls=[],deleted=[],timers=new Map();
let timer=0,identity={id:'user-1'},binding={state:'BOUND',personId:'person-1',bindingId:'binding-1',userId:'user-1'},handler=()=>{throw Error('Unexpected request');};
const request=async(method,url,data,options)=>{calls.push({method,url,data:clone(data??null),options});return handler(method,url,data,options);};
const http=Object.fromEntries(['get','post','put','patch','del'].map(m=>[m,(...args)=>request(m,...args)]));
const cache=new Map();let downloadedUrl='',downloadHeader=null,redirect=false;
const wx={hideShareMenu(){},stopPullDownRefresh(){},navigateTo(o){calls.push(o);},redirectTo(o){calls.push(o);},
  getFileSystemManager:()=>({unlink(o){deleted.push(o.filePath);},readFile(o){o.success({data:new ArrayBuffer(o.length)});}}),
  downloadFile(o){downloadedUrl=o.url;downloadHeader=o.header;Promise.resolve().then(()=>o.success({statusCode:200,tempFilePath:'/tmp/private'}));return {abort(){},onHeadersReceived(fn){fn({header:redirect?{Location:'https://cos.example/public'}:{}});}};},
  previewImage:async()=>{},
};
const mocks=new Map([
  ['utils/request.ts',{http,httpWithMeta:http}],
  ['config/index.ts',{__esModule:true,default:{baseURL:'https://test.jualn.cn'}}],
  ['utils/auth-transport.ts',{getAuthToken:async()=> 'current-session'}],
  ['actions/current-user.ts',{getCurrentIdentity:()=>identity,watchCurrentIdentity:fn=>{identityWatchers.push(fn);return()=>{};}}],
  ['services/person-binding.ts',{getMyPersonBinding:async()=>binding,requireCurrentPerson:async()=>binding,assertCurrentPerson:async b=>{if(b!==binding)throw Error('binding changed');},watchPersonBinding:fn=>{bindingWatchers.push(fn);return()=>{};}}],
  ['utils/notify.ts',{getErrorMessage:e=>e?.userMessage??e?.message??'error',showInfoToast(){}}],
  ['utils/wx-promise.ts',{wxShowModal:async()=>({confirm:true}),wxNavigateTo:o=>calls.push(o),chooseMessageFile:async()=>[]}],
  ['actions/media.ts',{selectImages:async()=>[]}],
  ['utils/cos.ts',{uploadCosFile:async o=>cosCalls.push(o),createCosClient:()=>Object.fromEntries(['multipartInit','multipartUpload','multipartComplete'].map(name=>[name,(o,cb)=>{cosCalls.push({name,...o});cb(null,{UploadId:'upload',ETag:'etag'});}]))}],
]);
function load(relative){
  relative=relative.replaceAll('\\','/');if(mocks.has(relative))return mocks.get(relative);if(cache.has(relative))return cache.get(relative);
  const file=path.join(root,relative),exports={};cache.set(relative,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>load(path.relative(root,path.resolve(path.dirname(file),n+'.ts'))),wx,Page:d=>pages.push(d),Date,Math,Set,Map,Error,Promise,ArrayBuffer,setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id)},{filename:file});return exports;
}
function instance(def){return{...def,data:clone(def.data),setData(p){Object.assign(this.data,p);}};}
const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
const api=load('subpkg_user/services/growth-record.ts'),media=load('subpkg_user/services/growth-media.ts');
const {NetworkError,HttpError}=load('utils/error.ts');
const fixture=()=>({link:{postId:'post-1',personId:'person-1',organizationId:'org-1',recordType:'GROWTH'},author:{id:'old-user',nickname:'昵称'},title:null,content:'感悟',media:[],publishedAt:'2026-11-02T18:00:00+08:00',category:null,topics:[],lifecycle:{acceptedAt:'2026-11-02T18:00:00+08:00',submissionVersion:'v1',effectiveVersion:'v1',visibility:'ORGANIZATION',safety:'PASSED',authorDeleted:false,adminHidden:false},availableActions:['COMMENT','LIKE','REPORT','SHARE'],likeCount:0,commentCount:0,viewCount:0,shareCount:0});
const editable=()=>({postId:'post-1',personId:'person-1',organizationId:'org-1',recordType:'GROWTH',title:null,content:'感悟',mediaIds:[],categoryId:null,topicIds:[]});
const context=()=>({personId:'person-1',evaluatedAt:'2026-11-02T18:00:00+08:00',organizations:[{organizationId:'org-1',name:'党支部',allowedRecordTypes:['GROWTH','POLITICAL_BIRTHDAY']}]});
const growthMedia=()=>({mediaId:'media-1',kind:'IMAGE',originalName:'a.jpg',contentType:'image/jpeg',sizeBytes:10,safety:'CHECKING',contentUrl:'https://test.jualn.cn/v1/media/files/opaque/content',unboundExpiresAt:'2099-01-01T00:00:00Z'});
const page=(items,nextCursor=null)=>({items,hasMore:nextCursor!==null,nextCursor});
check('frozen Contract target and every source digest match',()=>{
 const contract=path.resolve(root,'../contracts'),target=JSON.parse(fs.readFileSync(path.join(contract,'.validation/growth-record-v1-target.json'),'utf8'));
 assert.equal(target.target,'growth-record-v1-r1');
 for(const entry of target.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(contract,entry.path))).digest('hex'),entry.sha256,entry.path);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(target.files)).digest('hex'),target.sourceDigestSha256);
});
check('record preserves original User and stable Person separately',()=>{const r=api.readRecord(fixture());assert.equal(r.author.id,'old-user');assert.equal(r.link.personId,'person-1');assert.equal(r.availableActions.includes('EDIT'),false);});
check('missing action set, unknown type, unsafe lifecycle fail closed',()=>{
 for(const change of [r=>delete r.availableActions,r=>r.link.recordType='NORMAL',r=>r.lifecycle.safety='UNKNOWN',r=>r.lifecycle.adminHidden=true,r=>r.lifecycle.authorDeleted=true]){const r=fixture();change(r);assert.throws(()=>api.readRecord(r));}
});
check('private/hidden is never labeled organization-visible',()=>{const r=fixture();r.lifecycle.visibility='PRIVATE';r.lifecycle.adminHidden=true;assert.match(api.presentation(api.readRecord(r)).statusLabel,/仅本人/);});
handler=()=>page([fixture()],'opaque');await api.listGrowth({},true);
check('personal collection uses Person endpoint, required auth and sensitive transport',()=>{const c=calls.at(-1);assert.equal(c.url,'/v1/users/me/growth-records');assert.equal(c.options.auth,'required');assert.equal(c.options.sensitive,true);assert.equal(c.options.retryAuth,false);assert.equal(c.data.pageSize,20);});
await assert.rejects(()=>api.listGrowth({},false));checks++;
handler=()=>page([fixture()]);await assert.rejects(()=>api.listGrowth({organizationId:'other'},false));checks++;
handler=()=>({items:[],hasMore:true,nextCursor:null});await assert.rejects(()=>api.listGrowth());checks++;
handler=()=>({items:[],hasMore:false,nextCursor:'stale'});await assert.rejects(()=>api.listGrowth());checks++;
handler=()=>({data:editable(),headers:{etag:'"v1"'}});const ed=await api.editableGrowth('post-1');
check('edit fetches growth editable via view=edit and strong ETag',()=>{assert.equal(ed.etag,'"v1"');assert.equal(calls.at(-1).data.view,'edit');});
handler=()=>({data:editable(),headers:{etag:'W/"weak"'}});await assert.rejects(()=>api.editableGrowth('post-1'));checks++;
handler=()=>({data:editable(),headers:{etag:'"v2"'}});await api.editGrowth('post-1',{content:'new',mediaIds:[]},'"v1"');
check('edit retains If-Match and never sends ordinary attachmentItems',()=>{const c=calls.at(-1);assert.equal(c.method,'patch');assert.equal(c.options.headers['If-Match'],'"v1"');assert.equal('attachmentItems' in c.data,false);});
check('media selection accepts only bounded images/MP4 and no borrowed file IDs',()=>{
 assert.equal(media.selectedGrowthFile('/tmp/a','a.mp4',209715200,'VIDEO').contentType,'video/mp4');
 for(const args of [['a.mov',10,'VIDEO'],['a.mp4',209715201,'VIDEO'],['a.pdf',10,'IMAGE'],['a.jpg',10485761,'IMAGE']])assert.throws(()=>media.selectedGrowthFile('/tmp/a',...args));
});
check('controlled bytes reject COS, signatures, other origin, admin and traversal',()=>{
 for(const url of ['https://cos.example/a','https://test.jualn.cn.evil/v1/media/files/a/content','https://test.jualn.cn/v1/media/files/a/content?token=x','https://test.jualn.cn/v1/admin/media/files/a/content','https://test.jualn.cn/v1/media/files/%2e%2e/content'])assert.throws(()=>media.controlledMediaUrl(url));
 assert.equal(media.controlledMediaUrl(growthMedia().contentUrl),growthMedia().contentUrl);
});
const downloaded=await media.downloadGrowthMedia(growthMedia(),()=>{},()=>{});
check('authenticated byte download returns local path with current auth, no public playback URL',()=>{assert.equal(downloaded,'/tmp/private');assert.equal(downloadHeader.Authorization,'Bearer current-session');assert.equal(downloadedUrl,growthMedia().contentUrl);});
redirect=true;await assert.rejects(()=>media.downloadGrowthMedia(growthMedia(),()=>{},()=>{}));redirect=false;checks++;
let valid=true;
await assert.rejects(()=>media.downloadGrowthMedia(growthMedia(),()=>{if(!valid)throw Error('stale');},()=>{valid=false;}));
check('stale downloads reclaim private local file',()=>assert.ok(deleted.includes('/tmp/private')));
const allocation=()=>({uploadId:'allocation',expiresAt:'2099-01-01T00:00:00Z',registrationExpiresAt:'2099-01-02T00:00:00Z',credentials:{bucket:'bucket',region:'region',objectKeys:['exact/key'],tmpSecretId:'test',tmpSecretKey:'test',sessionToken:'test',expiredTime:4070908800}});
let registrations=0;handler=(m,url)=>url.endsWith('/uploads')?allocation():(++registrations===1?Promise.reject(new NetworkError('lost register response')):growthMedia());
const attempt={uploaded:false},file=media.selectedGrowthFile('/tmp/a','a.jpg',10,'IMAGE'),uploadContext={organizationId:'org-1',recordType:'GROWTH'};
await assert.rejects(()=>media.uploadGrowthFile(uploadContext,file,attempt,()=>{},()=>{}));
const putCount=cosCalls.length;await media.uploadGrowthFile(uploadContext,file,attempt,()=>{},()=>{});
check('registration recovery reuses uploadId/fileIndex and does not repeat immutable PUT',()=>{assert.equal(cosCalls.length,putCount);assert.equal(calls.at(-1).data.uploadId,'allocation');assert.equal(calls.at(-1).data.fileIndex,0);assert.equal(attempt.media.mediaId,'media-1');});
check('growth uploads carry exact business context, not ordinary POST targetType',()=>{const c=calls.find(c=>c.url==='/v1/growth-media/uploads');assert.equal(c.data.organizationId,'org-1');assert.equal(c.data.recordType,'GROWTH');assert.equal('targetType'in c.data,false);});
const video=load('subpkg_user/services/private-video-upload.ts');cosCalls.length=0;await video.uploadPrivateVideo(allocation().credentials,{path:'/tmp/video',size:6*1024*1024},()=>{},()=>{});
check('bounded multipart video preserves immutable headers without PostObject',()=>{assert.deepEqual(cosCalls.map(c=>c.name),['multipartInit','multipartUpload','multipartUpload','multipartComplete']);for(const c of cosCalls)assert.equal(c.Headers['x-cos-forbid-overwrite'],'true');assert.ok(cosCalls.filter(c=>c.name==='multipartUpload').every(c=>c.ContentLength<=5*1024*1024));});
load('subpkg_user/pages/growth-list/list.ts');const list=instance(pages.at(-1));list.onLoad({});list._visible=true;
handler=()=>page([fixture()],'next');await list.load();
handler=()=>page([fixture()]);await list.load(true);
check('personal list deduplicates opaque post IDs without changing server order',()=>{assert.equal(list.data.items.length,1);assert.equal(list.data.hasMore,false);assert.equal(list._cursor,undefined);});
const deferred=[];handler=()=>new Promise(resolve=>deferred.push(resolve));const old=list.load();await flush();binding={...binding,personId:'person-2',bindingId:'binding-2'};for(const watcher of bindingWatchers)watcher();await flush();
check('binding switch immediately clears list and cursor',()=>{assert.equal(list.data.items.length,0);assert.equal(list._cursor,undefined);});
const next=fixture();next.link.personId='person-2';next.link.postId='new';deferred[1](page([next]));await flush();deferred[0](page([fixture()],'old-cursor'));await old;await flush();
check('old binding response cannot repopulate records or cursor',()=>{assert.equal(list.data.items[0].link.postId,'new');assert.equal(list._cursor,undefined);});
list.onHide();check('hidden personal page drops private render state',()=>assert.equal(list.data.items.length,0));
binding={state:'BOUND',personId:'person-1',bindingId:'binding-1',userId:'user-1'};
load('subpkg_user/pages/growth-edit/edit.ts');const editDefinition=pages.at(-1);const editor=instance(editDefinition);editor.onLoad({});editor._visible=true;handler=()=>context();await editor.load();editor.changeOrganization({detail:{value:'0'}});editor.changeType({detail:{value:'0'}});editor.setData({content:'original draft'});
let createCount=0;handler=(m,url)=>url.endsWith('/growth-publishing-context')?context():url==='/v1/growth-records'?(++createCount===1?Promise.reject(new NetworkError('timeout')):fixture()):Promise.reject(Error('unexpected '+url));
await editor.submit();const reopened=instance(pages.at(-1));reopened.onLoad({});reopened._visible=true;handler=()=>({evaluatedAt:'2026-11-02T18:00:00+08:00',organizations:[]});await reopened.load();check('unconfirmed creation restores its exact operation after Page navigation',()=>{assert.equal(reopened.data.unresolved,true);assert.equal(reopened.data.content,'original draft');assert.equal(reopened._pending.key,editor._pending.key);});handler=(m,url)=>url.endsWith('/growth-publishing-context')?context():fixture();const original=calls.filter(c=>c.url==='/v1/growth-records'&&c.method==='post').at(-1);editor.inputContent({detail:{value:'changed draft'}});
check('uncertain creation preserves and locks draft and logical operation',()=>{assert.equal(editor.data.unresolved,true);assert.equal(editor.data.content,'original draft');assert.equal(editor._pending.key,original.options.headers['Idempotency-Key']);});
await editor.submit();const replay=calls.filter(c=>c.url==='/v1/growth-records'&&c.method==='post').at(-1);
check('explicit recovery keeps exact body and idempotency key, creates no ordinary Post',()=>{assert.deepEqual(replay.data,original.data);assert.equal(replay.options.headers['Idempotency-Key'],original.options.headers['Idempotency-Key']);assert.equal(calls.some(c=>c.url==='/v1/post'&&c.method==='post'),false);assert.equal(editor.data.saved,true);});
const denied=instance(pages.at(-1));denied.onLoad({});denied._visible=true;handler=()=>context();await denied.load();denied.changeOrganization({detail:{value:'0'}});denied.changeType({detail:{value:'0'}});denied.setData({content:'keep me'});handler=(m,url)=>url.endsWith('/growth-publishing-context')?context():Promise.reject(new HttpError(403,'denied'));await denied.submit();
check('definitive denial preserves editable draft without uncertain-operation lock',()=>{assert.equal(denied.data.content,'keep me');assert.equal(denied.data.unresolved,false);assert.equal(denied._pending,null);});
load('subpkg_user/pages/growth-detail/detail.ts');const detail=instance(pages.at(-1));detail.onLoad({postId:'post-1'});detail._visible=true;handler=()=>fixture();await detail.load();
check('new account historical read exposes no inferred edit/delete actions',()=>{assert.equal(detail.data.canEdit,false);assert.equal(detail.data.canDelete,false);assert.equal(detail.data.canComment,true);});
check('share returns generic entry without body, media or organization identity',()=>assert.deepEqual(clone(detail.onShareAppMessage()),{title:'E 网同心',path:'/pages/index/index'}));

const temporary=fixture();temporary.media=[growthMedia()];temporary.lifecycle.visibility='TEMPORARY_ORGANIZATION';temporary.lifecycle.safety='CHECKING';temporary.lifecycle.temporaryVisibleUntil=new Date(Date.now()+60000).toISOString();handler=()=>temporary;await detail.load();const expiry=detail._timer;
await detail.openMedia({currentTarget:{dataset:{id:'media-1'}}});
check('opening media keeps the temporary visibility expiry guard',()=>assert.ok(timers.has(expiry)));
const privateRecord=fixture();privateRecord.lifecycle.visibility='PRIVATE';privateRecord.availableActions=[];handler=()=>privateRecord;timers.get(expiry).fn();await flush();
check('temporary visibility expiry reauthorizes and disables stale actions/media',()=>{assert.equal(detail.data.record.lifecycle.visibility,'PRIVATE');assert.equal(detail.data.canComment,false);assert.equal(detail.data.canShare,false);assert.equal(detail.data.videoPath,'');});
load('subpkg_user/pages/growth-edit/edit.ts');const editPage=instance(editDefinition);editPage.onLoad({postId:'post-1'});editPage._visible=true;const editableRecord=fixture();editableRecord.availableActions=['EDIT'];
handler=(method,url,data)=>url.endsWith('growth-publishing-context')?context():url.startsWith('/v1/growth-records/')?editableRecord:method==='get'?{data:editable(),headers:{etag:'"v1"'}}:Promise.reject(new HttpError(412,'conflict'));
await editPage.load();editPage.setData({content:'local draft'});await editPage.submit();
check('edit conflict keeps draft and requires version review',()=>{assert.equal(editPage.data.content,'local draft');assert.equal(editPage.data.needsVersion,true);assert.equal(editPage._etag,'"v1"');});
handler=()=>({data:{...editable(),content:'remote draft'},headers:{etag:'"v2"'}});await editPage.reloadVersion();
check('version review exposes remote content and preserves local draft',()=>{assert.equal(editPage.data.remoteContent,'remote draft');assert.equal(editPage.data.content,'local draft');assert.equal(editPage._etag,'"v2"');assert.equal(editPage.data.needsVersion,false);});
handler=(method,url)=>url.endsWith('growth-publishing-context')?context():url.startsWith('/v1/growth-records/')?editableRecord:{data:{...editable(),content:'local draft'},headers:{etag:'"v3"'}};await editPage.submit();
check('reviewed edit submits only growth fields with latest If-Match',()=>{const c=calls.filter(c=>c.method==='patch').at(-1);assert.equal(c.options.headers['If-Match'],'"v2"');assert.equal(c.data.content,'local draft');assert.deepEqual(Object.keys(c.data).sort(),['content','mediaIds','title']);});

editPage._visible=false;editPage.invalidate();check('binding invalidation clears remote-version preview and saved record route',()=>{assert.equal(editPage.data.remoteTitle,'');assert.equal(editPage.data.remoteContent,'');assert.equal(editPage.data.remoteVersionLoaded,false);assert.equal(editPage.data.savedPostId,'');assert.equal(editPage.data.files.length,0);});
const notify=load('utils/notification-target.ts');
check('growth notification routes safely with comment context, including private result targets',()=>{
 for(const type of ['POST_DETAIL','MY_POST_DETAIL'])assert.equal(notify.resolveNotificationTarget({type,postId:'opaque id',commentId:'comment/1',growthRecordTarget:true}),'/subpkg_user/pages/growth-detail/detail?postId=opaque%20id&commentId=comment%2F1');
 assert.equal(notify.resolveNotificationTarget({type:'POST_DETAIL',postId:'post-1',growthRecordTarget:false}),null);
 assert.equal(notify.resolveNotificationTarget({type:'ACTIVITY_DETAIL',postId:'post-1',growthRecordTarget:true}),null);
 assert.equal(notify.resolveNotificationTarget({type:'POST_DETAIL',postId:'',growthRecordTarget:true}),null);
});
check('home growth and political birthday menus route to the archive',()=>{const source=fs.readFileSync(path.join(root,'pages/index/index.ts'),'utf8');assert.match(source,/id === 'growth-profile3' \|\| id === 'growth-profile4'/);assert.match(source,/recordType=POLITICAL_BIRTHDAY/);});
check('all growth pages are registered in User subpackage and profile entry is reachable',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')),pkg=app.subPackages.find(p=>p.root==='subpkg_user');
 for(const p of ['growth-list/list','growth-detail/detail','growth-edit/edit'])assert.ok(pkg.pages.includes('pages/'+p));
 assert.match(fs.readFileSync(path.join(root,'pages/me/me.wxml'),'utf8'),/growth-list\/list/);
});
console.log(`GrowthRecord: ${checks} checks passed (mocked transport/Page runtime; no provider/device validation).`);

