import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const data = new Map(), revoked = [], state = {};
let completeLogin, refresh, failLogout = false, suppressed = false, failStorage = false;
const storage = { get: k => data.get(k), set: (k,v) => { if(failStorage)return false;data.set(k,v); return true; }, remove: k => data.delete(k) };
const keys = { TOKEN:'token', USER_INFO:'userInfo', USER_SETTING:'userSetting', AUTH_LOGGED_OUT:'authLoggedOut', REGISTRATION_FIELD_CANDIDATES:'registrationFieldCandidates' };
const stubs = {
 '../services/auth': { login: () => new Promise(resolve => { completeLogin=resolve; }), logout: async token => { if(failLogout) throw new Error('unknown'); revoked.push(token); } },
 '../utils/wx-promise': { wxLogin: async () => ({code:'synthetic'}) },
 '../utils/storage': { storage, STORAGE_KEYS:keys },
 '../stores/index': { appStore:{setState: value => Object.assign(state,value)} },
 '../stores/helper': { clearUserState: () => {state.token='';} },
 '../utils/logger': { createLogger: () => ({info(){},error(){}}) },
 '../utils/event-bus': { eventBus:{emit(){}}, EVENTS:{LOGIN_SUCCESS:'login',LOGOUT:'logout'} },
 '../utils/auth-session': { authReady:Promise.resolve(), markAuthReady(){}, isAuthRecoverySuppressed:()=>suppressed, suppressAuthRecovery:value=>{suppressed=value;}, registerAuthRefreshHandler: fn => {refresh=fn;} },
};
const module={exports:{}};
const code=ts.transpileModule(fs.readFileSync('actions/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module,exports:module.exports,require:n=>{assert.ok(stubs[n],n);return stubs[n];},console,Promise});
const auth=module.exports;
const pending=auth.ensureLogin(); await new Promise(setImmediate);
const logout=auth.logout();
completeLogin({token:'late-candidate',userInfo:{id:1}});
await Promise.all([pending,logout]);
assert.deepEqual(revoked,['late-candidate']);assert.equal(auth.getToken(),undefined);
await assert.rejects(()=>refresh('late-candidate'));
await assert.rejects(() => auth.ensureLogin(), /登录/);
const login=auth.ensureLogin({interactive:true});await new Promise(setImmediate);
completeLogin({token:'current',userInfo:{id:1}});await login;
assert.equal(auth.getToken(),'current');
failStorage=true;await assert.rejects(()=>auth.logout());assert.equal(suppressed,true);assert.equal(auth.getToken(),'current');failStorage=false;
failLogout=true;await assert.rejects(()=>auth.logout());assert.equal(auth.getToken(),'current');
await assert.rejects(()=>refresh('current'));assert.equal(auth.isLoggedIn(),false);
failLogout=false;await auth.logout();assert.equal(auth.getToken(),undefined);assert.deepEqual(revoked,['late-candidate','current']);
const transport=fs.readFileSync('services/api.ts','utf8');
assert.match(transport,/logout: \(token: string\)[\s\S]*?auth: 'none', retryAuth: false, sensitive: true/);
console.log('Security foundation: late login, logout retry, refresh suppression and exact-token transport PASS');
