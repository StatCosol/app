const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const kotlin=fs.readFileSync('mobile/essportal/src/main/java/com/statcosol/ess/portal/EssSessionBridge.kt','utf8');
const template=kotlin.split('val code = """')[1].split('""".trimIndent()')[0];
function page(saved={}, origin='https://app.statcosol.com', framed=false) {
 class Storage { constructor(){this.values=new Map();} getItem(k){return this.values.get(k)??null;} setItem(k,v){this.values.set(k,String(v));} removeItem(k){this.values.delete(k);} clear(){this.values.clear();} }
 const posted=[], pending=[];const window={StatcoSession:{postMessage:s=>posted.push(JSON.parse(s))}};window.top=framed?{}:window;
 const context={window,Storage,sessionStorage:new Storage(),localStorage:new Storage(),location:{origin},queueMicrotask:fn=>pending.push(fn)};
 const script=template.replace('${JSONObject.quote(origin)}',JSON.stringify('https://app.statcosol.com')).replace('$session',JSON.stringify(saved));vm.runInNewContext(script,context);
 return {...context,posted,flush:()=>{while(pending.length)pending.shift()();}};
}
const saved={accessToken:'access',refreshToken:'refresh',user:JSON.stringify({roleCode:'EMPLOYEE'}),encryptionKey:'key'};
let p=page(saved);assert.equal(p.sessionStorage.getItem('refreshToken'),'refresh');
p.sessionStorage.setItem('accessToken','new-access');p.sessionStorage.setItem('refreshToken','new-refresh');p.flush();assert.equal(p.posted.length,1);assert.equal(p.posted[0].session.refreshToken,'new-refresh');
p.sessionStorage.removeItem('accessToken');p.sessionStorage.removeItem('refreshToken');p.flush();assert.deepEqual(p.posted.at(-1),{action:'clear'});
p=page();p.sessionStorage.setItem('accessToken','token');p.sessionStorage.setItem('refreshToken','refresh');p.sessionStorage.setItem('user',JSON.stringify({roleCode:'ADMIN'}));p.flush();assert.deepEqual(p.posted[0],{action:'clear'});
p=page(saved,'https://other.example');assert.equal(p.sessionStorage.getItem('accessToken'),null);
p=page(saved,'https://app.statcosol.com',true);assert.equal(p.sessionStorage.getItem('accessToken'),null);
p=page(saved);p.localStorage.setItem('accessToken','unrelated');p.sessionStorage.setItem('password','never-send');p.flush();assert.equal(p.posted.length,0);
console.log('PASS: native startup script restores employee sessions, coalesces token rotations, clears logout/non-employee state, excludes other origins/iframes, and ignores passwords/local storage.');
