// Actual TS consumer modules with isolated HTTP/wx/qualification boundaries; no runtime proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..'), cache=new Map(), mocks=new Map(), calls=[], toasts=[];
let definition, bindingReads=0, bound=false, epoch=0, owner='mentor-user', failWrite, sent=[], editPatch, failEdit;
const absolute=x=>path.resolve(root,x), mock=(f,x)=>mocks.set(absolute(f),x);
const plain=x=>JSON.parse(JSON.stringify(x));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function load(file){file=absolute(file);if(mocks.has(file))return mocks.get(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:false}}).outputText;vm.runInNewContext(code,{exports,Page:x=>{definition=x;},Component:x=>{definition=x;},wx:{nextTick:f=>f(),showLoading(){},hideLoading(){},stopPullDownRefresh(){},setNavigationBarTitle(){},redirectTo:async x=>calls.push(x),navigateTo:async x=>calls.push(x)},setTimeout:()=>1,clearTimeout(){},require:id=>load(path.resolve(path.dirname(file),id+'.ts'))},{filename:file});return exports;}
function instance(){return{...definition,...definition.methods,data:plain(definition.data),properties:Object.fromEntries(Object.entries(definition.properties??{}).map(([key,p])=>[key,p.value])),setData(patch){for(const[key,v]of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.'),last=parts.pop();parts.reduce((x,k)=>x[k],this.data)[last]=v;}},triggerEvent:(name,data)=>calls.push({name,data}),getOpenerEventChannel:()=>({emit(){}})};}
mock('utils/logger.ts',{createLogger:()=>({info(){},warn(){},error(){}})});
mock('utils/notify.ts',{showErrorToast:e=>toasts.push(e.message),showInfoToast:x=>toasts.push(x),showSuccessToast:x=>toasts.push(x),notifyToast:x=>toasts.push(x.title),getErrorMessage:(e,f)=>e.userMessage??e.message??f});
mock('utils/wx-promise.ts',{wxShowModal:async()=>({confirm:true}),wxGetWindowInfo:()=>({screenHeight:800,windowHeight:800,safeArea:{bottom:800}}),wxOnKeyboardHeightChange(){},wxOffKeyboardHeightChange(){}});
mock('utils/storage.ts',{STORAGE_KEYS:{TOKEN:'token'},storage:{get:()=>owner}});
mock('actions/current-user.ts',{getCurrentIdentity:()=>({id:owner,nickname:'newly-bound-user'}),peekCurrentProfile:()=>null,watchCurrentIdentity:()=>()=>{}});
mock('utils/time-util.ts',{formatTime:x=>x,TimeStyle:{POST:1}});mock('utils/avatar.ts',{getAvatarInfo:()=>({bg:'',char:''})});
mock('utils/defineComponent.ts',{default:()=>x=>{definition=x;}});mock('behaviors/sheet-mixin.ts',{useSheet:()=>({})});
let upload=async()=>[];mock('actions/media.ts',{uploadFilesToCos:(...args)=>upload(...args)});
mock('services/person-binding.ts',{watchPersonBinding:()=>()=>{},personBindingEpoch:()=>epoch,getMyPersonBinding:async()=>{bindingReads++;return bound?{state:'BOUND',personStatus:'ACTIVE'}:{state:'UNBOUND'};}});
mock('services/mentor-certification.ts',{getCertifiedMentorProfile:async()=>({realName:'当前认证名称'})});
const http=Object.fromEntries(['get','post','put','del'].map(method=>[method,async(url,data,options)=>{calls.push({method,url,data,options});return{};}]));mock('utils/request.ts',{http,httpWithMeta:{}});
const flags=load('config/post-capabilities.ts').POST_CAPABILITIES;assert.equal(flags.communityV1,true);assert.equal(flags.organization,true);assert.equal(flags.mentorQa,true);assert.equal(flags.mentorAnswers,true);assert.equal(flags.legacyNormalProvider,false);
// Independently verify that disabling formal answers does not block ordinary discussion.
flags.mentorAnswers=false;
flags.communityV1=flags.organization=flags.mentorQa=true;
const allowed={state:'ALLOWED',reason:'NONE'},denied={state:'DENIED',reason:'MENTOR_REQUIRED'};
const summary={questionVersion:'question-v1',answerState:'UNANSWERED',publicAnswerCount:0,contentLocked:true,evaluatedAt:'2026-10-31T10:00:00+08:00'};
const attribution={questionVersion:'question-v1',qualifiedAt:'2026-10-31T09:00:00+08:00',firstPublishedAt:'2026-10-31T10:00:00+08:00',profileAtAnswer:{realName:'原导师姓名',position:'原职务',affiliation:'原单位'},currentCertification:{state:'INACTIVE',evaluatedAt:'2026-10-31T11:00:00+08:00'}};
const qa=load('utils/mentor-qa.ts');assert.equal(qa.readQaSummary({...summary,contentLocked:false}).answerState,'UNANSWERED');assert.equal(qa.readQaSummary({...summary,publicAnswerCount:1}),undefined);assert.equal(qa.readQaSummary({...summary,questionVersion:''}),undefined);assert.equal(qa.qaAnswerLabel(undefined),'回答状态暂不可确认');assert.equal(qa.readQaSummary(summary).contentLocked,true);assert.match(qa.certificationLabel('UNAVAILABLE'),/不可确认/);assert.doesNotMatch(qa.certificationLabel('INACTIVE'),/撤销|到期/);
const wire=(id,type='MENTOR_QA')=>({id,postType:type,content:'问题正文',title:null,author:{id:owner,nickname:'昵称'},attachments:[],commentCount:99,likeCount:0,viewCount:0,liked:false,qaSummary:summary,topics:[],category:{id:'category',name:'学业'},commentPermission:allowed});
let page={list:[wire('q')],hasMore:true,cursor:'next',nextCursor:null};
const api={post:{getList:async query=>{calls.push(query);return page;},getDetail:async()=>wire('q')}};mock('services/api.ts',{api});
const postService=load('services/post.ts');
await assert.rejects(postService.fetchPostList({answerState:'ANSWERED'}));
await assert.rejects(postService.fetchPostList({postType:'ALL',answerState:'UNANSWERED'}));
await postService.fetchPostList({postType:'MENTOR_QA',answerState:'UNANSWERED',categoryId:'c',topicId:'t',cursor:'bound'});assert.equal(calls.at(-1).answerState,'UNANSWERED');assert.equal(calls.at(-1).cursor,'bound');assert.equal(postService.mapPostListItem(wire('q')).qaSummary.publicAnswerCount,0);assert.equal(postService.mapPostListItem({...wire('q'),qaSummary:undefined}).qaSummary,undefined);
const {community}=load('services/post-community.ts');
for(const method of ['myPosts','myComments','favorites','history']){await community[method]('cursor','MENTOR_QA');assert.equal(calls.at(-1).data.postType,'MENTOR_QA');assert.equal(calls.at(-1).data.cursor,'cursor');}
const reply={id:'discussion',parentId:'answer',kind:'DISCUSSION',content:'任意正常用户讨论',author:{id:'other'},createdAt:'now',likeCount:0,liked:false,replyToCommentId:'answer',replyPermission:allowed};
const rootWire={id:'answer',state:'VISIBLE',kind:'MENTOR_ANSWER',mentorAnswer:attribution,content:'正式回答',author:{id:owner,nickname:'新绑定人员昵称'},createdAt:'now',likeCount:0,liked:false,replyCount:1,previewReplies:[reply],replyPermission:allowed};
const comments=load('services/comment.ts'), projection=load('utils/user-projection.ts');
const answer=comments.mapThreadRoot(rootWire,'MENTOR_QA');assert.equal(answer.nickName,'原导师姓名');assert.equal(answer.mentorAnswer.currentCertification.state,'INACTIVE');
const projected=projection.projectCommentAuthor(answer,{userId:owner,nickname:'另一个Person昵称',avatarUrl:'new-avatar',isPlatformOperator:true});assert.equal(projected.nickName,'原导师姓名');assert.equal(projected.mentorAnswer.profileAtAnswer.position,'原职务');
for(const state of ['VALID','INACTIVE','UNAVAILABLE','FUTURE'])assert.equal(comments.mapThreadRoot({...rootWire,mentorAnswer:{...attribution,currentCertification:{...attribution.currentCertification,state}}},'MENTOR_QA').mentorAnswer.currentCertification.state,state);
assert.throws(()=>comments.mapThreadRoot({...rootWire,mentorAnswer:undefined},'MENTOR_QA'));assert.throws(()=>comments.mapThreadRoot({...rootWire,kind:'FUTURE'},'MENTOR_QA'));
const placeholder=comments.mapThreadRoot({...rootWire,state:'ADMIN_HIDDEN'},'MENTOR_QA');assert.equal(placeholder.userId,'');assert.equal(placeholder.content,'');assert.equal(placeholder.mentorAnswer,undefined);assert.equal(placeholder.replyPreview[0].kind,'DISCUSSION');
community.replies=async()=>({list:[{...reply,kind:'MENTOR_ANSWER'}],hasMore:false});await assert.rejects(comments.getReplyList({targetType:'POST',targetId:'q',parentId:'answer',postType:'MENTOR_QA',representation:'thread'}));
mock('actions/comment.ts',{createCommentWithImage:async request=>{calls.push(request);return 'activity-comment';},syncCommentAuthor:x=>x,getCommentList:async query=>{calls.push(query);return{list:[],hasMore:false};}});
mock('actions/post-creation.ts',{pendingPostCreation:()=>undefined,createCommunityComment:async payload=>{sent.push(plain(payload));if(failWrite)throw failWrite;return{id:'pending-answer'};}});
load('components/comment-panel/index.ts');const panelDefinition=definition;
function panel(){definition=panelDefinition;const p=instance();Object.assign(p.properties,{postType:'MENTOR_QA',targetType:'POST',targetId:'q',commentPermission:denied,questionVersion:'question-v1'});p.data.firstLoading=false;p.data.mentorName='认证名称';p._selectedFiles=[];p._requestGeneration=0;p._loadComments=async()=>{};p._refreshPublicCount=async()=>{};return p;}
const activity=panel();activity.properties.targetType='ACTIVITY';activity.properties.postType='NORMAL';activity.properties.commentPermission=undefined;activity.onInputChange({detail:{value:'原活动评论'}});await activity.onSend();assert.equal(activity.data.currentTotalCount,1);assert.equal(activity.data.commentList[0].commentId,'activity-comment');assert.equal(bindingReads,0);
const discussion=panel();discussion.data.replyTarget={commentId:'answer',replyToCommentId:'discussion',nickName:'同学'};discussion.data.commentList=[answer];discussion.onInputChange({detail:{value:'无Person也可讨论'}});await discussion.onSend();assert.equal(bindingReads,0);assert.equal(sent.length,1);assert.equal(sent[0].parentId,'answer');assert.equal(sent[0].replyToCommentId,'discussion');assert.equal(sent[0].questionVersion,undefined);assert.equal(discussion.data.currentTotalCount,1);assert.equal(discussion.data.submissionNotice,'');assert.equal(discussion.data.commentList[0].replyList[0].localPreview,true);
const formal=panel();formal.properties.commentPermission=allowed;formal.onInputChange({detail:{value:'正式回答草稿'}});await formal.onSend();assert.equal(sent.length,1,'mentorAnswers closed blocks formal only');
flags.mentorAnswers=true;formal.properties.questionVersion='';await formal.onSend();assert.equal(sent.length,1);formal.properties.questionVersion='question-v1';await formal.onSend();assert.equal(sent.at(-1).questionVersion,'question-v1');assert.equal(sent.at(-1).personId,undefined);assert.equal(sent.at(-1).kind,undefined);assert.equal(formal.data.commentList[0].nickName,'认证名称');assert.equal(formal.data.commentList[0].localPreview,true);assert.equal(formal.data.currentTotalCount,1);assert.equal(bindingReads,0,'formal answers rely on server permission, never BOUND or a self-service receipt');
const errors=load('utils/error.ts');
const composer = panel();
composer.data.mentorName = '';
await composer.startWriting();
assert.equal(composer.data.mentorName, '');
composer.properties.commentPermission = allowed;
await composer.startWriting();
assert.equal(composer.data.mentorName, '当前认证名称');
composer.onInputChange({detail:{value:'未写完的正式回答'}});
composer.data.commentList = [answer];
composer.onReplyTap({currentTarget:{dataset:{commentId:'answer',replyToCommentId:'answer',nickName:'平台昵称',userId:owner}}});
assert.equal(composer.data.replyTarget.nickName, '原导师姓名');
assert.equal(composer.data.replyAuthor.nickName, '原导师姓名');
assert.equal(composer._draftValue, '');
composer.cancelReply();
assert.equal(composer._draftValue, '未写完的正式回答');
const automaticComposer = panel();
automaticComposer.properties.mode = 'inline';
automaticComposer.properties.commentPermission = allowed;
automaticComposer.data.mentorName = '';
automaticComposer._refreshWriteFeedback();
await flush();
assert.equal(automaticComposer.data.mentorName, '当前认证名称', 'inline formal composer prepares without another click');
assert.equal(automaticComposer.data.inputAutoFocus, false, 'preparing the composer does not open the keyboard');
// A bound or approved person cannot override a reliable server denial.
bound=true;
const deniedFormal=panel();deniedFormal.onInputChange({detail:{value:'保留的回答草稿'}});
let sentBefore=sent.length;await deniedFormal.onSend();assert.equal(sent.length,sentBefore);assert.match(deniedFormal.data.writeFeedback,/管理员核实/);assert.equal(deniedFormal._draftValue,'保留的回答草稿');
for(const [status,problem,pattern] of [[403,'mentor-answer-forbidden',/管理员核实/],[503,'mentor-qualification-unavailable',/暂不可用/]]){
  const rejected=panel();rejected.properties.commentPermission=allowed;rejected.onInputChange({detail:{value:'拒绝后保留草稿'}});
  failWrite=new errors.HttpError(status,'rejected',{problemType:'/problems/'+problem});const callsBefore=calls.length;
  await rejected.onSend();assert.equal(rejected._draftValue,'拒绝后保留草稿');assert.match(toasts.at(-1),pattern);assert.equal(rejected.data.submissionNotice,'');assert.ok(calls.slice(callsBefore).some(x=>x.name==='refreshquestion'));assert.equal(rejected.data.commentList.length,0);
}
failWrite=undefined;
const blockedFormal=panel();blockedFormal.properties.commentPermission={state:'BLOCKED',reason:'QUALIFICATION_UNAVAILABLE'};blockedFormal.onInputChange({detail:{value:'未知资格草稿'}});sentBefore=sent.length;await blockedFormal.onSend();assert.equal(sent.length,sentBefore);assert.match(blockedFormal.data.writeFeedback,/暂不可用/);
// Permission or binding changes while media uploads cannot submit a stale formal answer.
for(const change of ['binding','permission']){
  const uploading=panel();uploading.properties.commentPermission=allowed;uploading.onInputChange({detail:{value:'上传中的回答草稿'}});uploading._selectedFiles=[{tempFilePath:'local'}];
  const pendingUpload=deferred();upload=()=>pendingUpload.promise;sentBefore=sent.length;
  const sending=uploading.onSend();await flush();
  if(change==='binding')epoch++;else uploading.properties.commentPermission=denied;
  pendingUpload.resolve([{url:'image',objectKey:'object'}]);await sending;
  assert.equal(sent.length,sentBefore);assert.equal(uploading._draftValue,'上传中的回答草稿');assert.equal(uploading.data.questionConflict,false);assert.match(uploading.data.submissionNotice,change==='binding'?/绑定已变化/:/管理员核实/);
}
upload=async()=>[];
const stale=panel();stale.properties.commentPermission=allowed;stale.onInputChange({detail:{value:'必须保留的旧问题草稿'}});failWrite=new errors.HttpError(409,'stale',{problemType:'/problems/mentor-question-version-stale'});await stale.onSend();assert.equal(stale.data.questionConflict,true);assert.equal(stale.data.questionNeedsReload,true);assert.equal(stale._draftValue,'必须保留的旧问题草稿');const before=sent.length;await stale.onSend();assert.equal(sent.length,before);
stale.acknowledgeQuestion();assert.equal(stale.data.questionConflict,true,'old version cannot be acknowledged');stale.properties.questionVersion='question-v2';panelDefinition.observers.questionVersion.call(stale,'question-v2');await stale.onSend();assert.equal(sent.length,before);stale.acknowledgeQuestion();failWrite=undefined;await stale.onSend();assert.equal(sent.at(-1).questionVersion,'question-v2');
// Changing the public version while a draft is typed never silently attaches it to the new question.
const changed=panel();changed.properties.commentPermission=allowed;changed.onInputChange({detail:{value:'draft'}});changed.properties.questionVersion='question-v2';panelDefinition.observers.questionVersion.call(changed,'question-v2');assert.equal(changed.data.questionConflict,true);assert.equal(changed._answerQuestionVersion,'question-v1');

// Answer-state filter participates in reset/race-safe cursor requests; no commentCount inference.
const requests=[];mock('actions/post.ts',{fetchPostList:query=>{const d=deferred();requests.push({query,...d});return d.promise;},getPostDetail:async()=>wire('q')});mock('services/post-dictionary.ts',{getPostCategories:async()=>({items:[]}),getPostTopics:async()=>({items:[]})});mock('utils/event-bus.ts',{EVENTS:{},eventBus:{on(){},off(){}}});
load('subpkg_community/pages/post-list/list.ts');const unknownList=instance();unknownList.onLoad({postType:'FUTURE'});assert.equal(unknownList.data.enabled,false);
const list=instance();list.data.enabled=true;list.data.categoryId='cat';list.data.topicId='topic';let op=list.load(true);requests[0].resolve({list:[{id:'old'}],hasMore:true,cursor:'old-cursor'});await op;
list.onAnswerStateChange({detail:{value:2}});assert.deepEqual(Array.from(list.data.qaFilters,group=>group.key),['state','category','topic']);assert.equal(list.data.qaFilters[2].selectedIndex,1);assert.equal(list.data.qaFilters[2].options[1].label,'# 当前话题');assert.equal(requests[1].query.answerState,'ANSWERED');assert.equal(requests[1].query.cursor,undefined);assert.equal(requests[1].query.categoryId,'cat');assert.equal(requests[1].query.topicId,'topic');
list.onAnswerStateChange({detail:{value:1}});requests[2].resolve({list:[],hasMore:true,cursor:'sparse'});await flush();requests[1].resolve({list:[{id:'stale'}],hasMore:false});await flush();assert.equal(list.data.posts.length,0);assert.equal(list.data.hasMore,true);op=list.load(false);assert.equal(requests[3].query.cursor,'sparse');requests[3].resolve({list:Array.from({length:21},(_,i)=>({id:String(i)})),hasMore:false});await op;assert.equal(list.data.posts.length,21);

// Existing editor consumes dynamic lock from private QA, separate from editable ETag.
const editable={id:'q',postType:'MENTOR_QA',title:'原题标题',content:'原题正文',attachmentItems:[{type:'IMAGE',url:'image'}],categoryId:'cat',topicIds:['topic']};
mock('services/post.ts',{getEditablePost:async()=>({post:plain(editable),etag:'"e1"'}),editPost:async(id,patch)=>{editPatch=plain(patch);if(failEdit)throw failEdit;return{};}});community.myPost=async()=>({post:wire('q'),submission:{id:'q',lifecycle:{acceptedAt:'now',submissionVersion:'v',effectiveVersion:'v',visibility:'PUBLIC',safety:'PASSED',authorDeleted:false,adminHidden:false},availableActions:['EDIT','DELETE']}});
load('subpkg_community/pages/post-edit/post-edit.ts');const editor=instance();editor.data.postId='q';await editor.loadEditable('q');assert.equal(editor.data.contentLocked,true);assert.equal(editor.data.lockReady,true);editor.onContentInput({detail:{value:'不能替换'}});assert.equal(editor.data.content,'原题正文');editor.onRemoveImage({currentTarget:{dataset:{index:0}}});assert.equal(editor.data.images.length,1);
editor.data.categoryId='new-cat';editor.data.topics=[{id:'new-topic'}];editor._resubmit=true;await editor.onSubmit();assert.equal(editPatch.categoryId,'new-cat');assert.equal(editPatch.content,undefined);assert.equal(editPatch.title,undefined);assert.equal(editPatch.attachmentItems,undefined);
editor._publishAccepted=false;editor.data.contentLocked=false;editor.data.content='并发编辑草稿';editor.data.categoryId='draft-category';failEdit=new errors.HttpError(409,'locked',{problemType:'/problems/mentor-question-content-locked'});await editor.onSubmit();assert.equal(editor.data.contentLocked,true);assert.equal(editor.data.content,'并发编辑草稿');assert.match(editor.data.recoveryNotice,/普通讨论/);assert.equal(editor._etag,'"e1"');await editor.restoreProtectedContent();assert.equal(editor.data.content,'原题正文');assert.equal(editor.data.categoryId,'draft-category');

// Personal QA uses explicit collection filters and private resources, retaining normal defaults.
const mine=[];community.myPosts=(cursor,postType)=>{const d=deferred();mine.push({cursor,postType,...d});return d.promise;};
load('subpkg_community/pages/my-community/list.ts');const myList=instance();myList.onLoad({kind:'posts',postType:'MENTOR_QA'});op=myList.load(true);assert.equal(mine[0].postType,'MENTOR_QA');myList.onPostType({currentTarget:{dataset:{type:'ALL'}}});assert.equal(mine[1].postType,'ALL');mine[1].resolve({items:[],hasMore:false});await flush();mine[0].resolve({items:[{post:wire('q'),submission:{id:'q',lifecycle:{visibility:'PRIVATE',safety:'CHECKING',acceptedAt:'now'}}}],hasMore:false});await op;assert.equal(myList.data.rows.length,0);
// Quiet question refresh preserves the component on version changes, rejects stale reads,
// and removes the old public body once the provider declares the question unavailable.
const questionReads=[];
mock('actions/post.ts',{getPostDetail:()=>{const d=deferred();questionReads.push(d);return d.promise;}});
mock('behaviors/useSharePoster.ts',{useSharePoster:()=>({})});mock('subpkg_community/behaviors/useAsyncLoad.ts',{useAsyncLoad:()=>({})});mock('utils/share_poster/postPoster.ts',{});
load('subpkg_community/pages/detail/detail.ts');const detail=instance();detail.data.targetId='q';detail.data.post=wire('q');detail._asyncLoadFail=message=>detail.failure=message;
const oldRead=detail.refreshQuestion(), newRead=detail.refreshQuestion();questionReads[1].resolve({...wire('q'),qaSummary:{...summary,questionVersion:'question-v3'}});await newRead;questionReads[0].resolve({...wire('q'),qaSummary:{...summary,questionVersion:'question-v2'}});await oldRead;assert.equal(detail.data.post.qaSummary.questionVersion,'question-v3');
op=detail.refreshQuestion();questionReads[2].reject(new errors.HttpError(404));await op;assert.equal(detail.data.post.id,undefined);assert.match(detail.failure,/不可访问/);
// A zero-count or stale observation cannot unfreeze a lock that was already proven.
community.myPost=async()=>({post:{...wire('q'),qaSummary:{...summary,contentLocked:false}},submission:{lifecycle:{visibility:'PRIVATE',safety:'PASSED',authorDeleted:false,adminHidden:true},availableActions:['EDIT']}});
await editor.refreshEditContext('q');assert.equal(editor.data.contentLocked,true);assert.equal(editor.data.editReady,false);
// Ordinary accounts can ask questions without invoking any Person/mentor check.
let asked, publicCreates=0;
mock('stores/helper.ts',{getUserId:()=>owner});mock('stores/postSyncStore.ts',{postSyncStore:{get:()=>undefined,set(){}}});mock('events/post-event.ts',{emitPostCreated:()=>publicCreates++});mock('services/interact.ts',{});
mock('actions/post-creation.ts',{createCommunityPost:async payload=>{asked=plain(payload);return{id:'private-question'};}});mocks.delete(absolute('actions/post.ts'));
const posts=load('actions/post.ts'), beforeBinding=bindingReads;bound=false;
assert.equal((await posts.publishPostAndSync({postType:'MENTOR_QA',content:'普通用户提问',categoryId:'category'})).id,'private-question');assert.equal(asked.postType,'MENTOR_QA');assert.equal(bindingReads,beforeBinding);assert.equal(publicCreates,0);
await assert.rejects(posts.publishPostAndSync({postType:'MENTOR_QA',content:'',categoryId:'category',attachmentItems:[{type:'IMAGE',url:'image'}]}));

assert.match(fs.readFileSync(path.join(root,'subpkg_community/pages/detail/detail.wxml'),'utf8'),/question-version=/);const commentTemplate=fs.readFileSync(path.join(root,'components/comment-panel/index.wxml'),'utf8');assert.match(commentTemplate,/profileAtAnswer.realName/);assert.doesNotMatch(commentTemplate,/查看回复者资料与导师认证/);assert.doesNotMatch(commentTemplate,/formalComposerOpen|closeFormalComposer|写正式回答/);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'subpkg_community/pages/post-list/list.json'),'utf8')).usingComponents['filter-bar'],'/components/filter-bar/index');
console.log('PASS Mentor QA V1: canonical summary/filters, historical identity/current certification, ordinary discussion without Person, versioned formal answers/stale draft acknowledgement, placeholder privacy, answer-state pagination/races, content lock/category-only edit/409 recovery, private type filters. VM/HTTP/wx substitutes only.');
