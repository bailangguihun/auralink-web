import {mountPosts} from './app.mjs';
import {mountRooms} from './rooms.mjs';
import {mountVoice} from './room-voice.mjs';
import {installDrafts} from './drafts.mjs';

const prefix='/api/community/v2';
function mediaPaths(value) {
 if(typeof value==='string') return value.startsWith('/join-room?')?value.replace('/join-room?','/community?'):value.startsWith('/uploads/')||value.startsWith('/api/v2/')?prefix+value:value;
 if(Array.isArray(value))return value.map(mediaPaths);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mediaPaths(v)]));
 return value;
}
/** One isolated DOM/runtime per platform login generation. No global handlers or token storage. */
export async function mountCommunity(host, options) {
 const controller=new AbortController(), timers=new Set(), intervals=new Set(), frames=new Set(), listeners=[];
 let disposed=false, instanceWindow;
 const presentations=new Map();
 const inactive=()=>disposed||!options.isCurrent();
 let bootReady=false,pendingReads=0;
 const updateReadiness=()=>{if(!inactive())host.dataset.pageReady=String(bootReady&&pendingReads===0);};
 updateReadiness();
 const assertCurrent=()=>{if(inactive())throw new DOMException('Community session changed','AbortError');};
 const isCancelled=error=>inactive()&&error?.name==='AbortError';
 const runTask=task=>Promise.resolve(task).catch(error=>{if(!isCancelled(error))throw error;});
 const guardEvent=handler=>function(...args){if(inactive())return;try{return runTask(handler.apply(this,args));}catch(error){if(!isCancelled(error))throw error;}};
 const root=host.shadowRoot || host.attachShadow({mode:'open'});
 const assets=await Promise.all(['template.html','reference.css','sidebar.css','artlive-theme.css'].map(async file=>{
  const response=await globalThis.fetch('/community-v2/'+file,{signal:controller.signal});
  if(!response.ok)throw new Error('社区页面资源加载失败');return response.text();
 }));
 if(!host.isConnected||!options.isCurrent())return ()=>{};
 root.innerHTML='';
 const style=globalThis.document.createElement('style');style.textContent=assets[1]+'\n'+assets[2]+'\n'+assets[3];
 const body=globalThis.document.createElement('div');body.className='reference-body';body.innerHTML=assets[0];root.append(style,body);
 const document=new Proxy(globalThis.document,{get(target,key){
  if(key==='body')return body;
  if(key==='querySelector'||key==='querySelectorAll')return body[key].bind(body);
  if(key==='getElementById')return id=>body.querySelector('#'+CSS.escape(id));
  if(key==='activeElement')return root.activeElement;
  if(key==='addEventListener')return (...args)=>body.addEventListener(...args);
  if(key==='removeEventListener')return (...args)=>body.removeEventListener(...args);
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
 const setTimeout=(fn,delay,...args)=>{if(inactive())return 0;const id=globalThis.setTimeout(()=>{timers.delete(id);if(!inactive())void runTask(fn(...args));},delay);timers.add(id);return id;};
 const clearTimeout=id=>{timers.delete(id);globalThis.clearTimeout(id);};
 const setInterval=(fn,delay,...args)=>{if(inactive())return 0;const id=globalThis.setInterval(()=>{if(!inactive())void runTask(fn(...args));},delay);intervals.add(id);return id;};
 const clearInterval=id=>{intervals.delete(id);globalThis.clearInterval(id);};
 const requestAnimationFrame=fn=>{if(inactive())return 0;const id=globalThis.requestAnimationFrame(time=>{frames.delete(id);if(!inactive())void runTask(fn(time));});frames.add(id);return id;};
 const cancelAnimationFrame=id=>{frames.delete(id);globalThis.cancelAnimationFrame(id);};
 const state={};
 instanceWindow=new Proxy(globalThis.window,{get(target,key){
  if(key in state)return state[key];
  if(key==='addEventListener')return (name,fn,opts)=>{target.addEventListener(name,fn,opts);listeners.push([name,fn,opts]);};
  if(key==='removeEventListener')return target.removeEventListener.bind(target);
  if(key==='setTimeout')return setTimeout;
  if(key==='setInterval')return setInterval;
  const value=Reflect.get(target,key,target);return typeof value==='function'&&!/^[A-Z]/.test(String(key))?value.bind(target):value;
 },set(target,key,value){state[key]=value;return true;}});
 const operationKey='artlive.community.reference.operations.v1:'+options.actorId;
 let uncertain=new Map(),journalProblem='';
 function restoreOperations(){
  try{
   const records=JSON.parse(sessionStorage.getItem(operationKey)||'[]');
   if(!Array.isArray(records))throw new Error('Invalid operation journal');
   const restored=new Map();
   for(const entry of records){
    if(!Array.isArray(entry)||entry.length!==2)throw new Error('Invalid operation entry');
    const [key,value]=entry;
    if(typeof key!=='string'||! /^(POST|PUT|PATCH|DELETE) \/api\//.test(key)||key.length>2000||restored.has(key)||
       !value||typeof value!=='object'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.id)||
       typeof value.signature!=='string'||value.signature.length>2000||!Number.isFinite(value.at)||value.at<0)throw new Error('Invalid operation record');
    restored.set(key,{id:value.id,signature:value.signature,at:value.at});
   }
   // Unresolved operations do not expire locally: age never proves a write failed.
   uncertain=restored;journalProblem='';return true;
  }catch{
   journalProblem='无法恢复待核对操作记录。原记录已保留；请恢复浏览器存储权限或联系支持核对，未提交新的操作。';
   return false;
  }
 }
 restoreOperations();
 const saveOperations=next=>{
  const encoded=JSON.stringify([...next]);
  try{sessionStorage.setItem(operationKey,encoded);if(sessionStorage.getItem(operationKey)!==encoded)throw new Error('Operation journal was not saved');}
  catch{throw new Error('浏览器无法保存操作标识，请恢复存储权限后再核对或提交。没有重复发送请求。');}
  uncertain=next;
 };
 const completeOperation=(key,id)=>{
  if(uncertain.get(key)?.id!==id)return;
  const next=new Map(uncertain);next.delete(key);saveOperations(next);
 };
 const resultResponse=(response,json)=>({ok:response.ok,status:response.status,headers:response.headers,json:async()=>{assertCurrent();return mediaPaths(json);}});
 async function resolveOperation(id){
  assertCurrent();
  const response=await globalThis.fetch(prefix+'/api/operations/'+id,{headers:{authorization:'Bearer '+options.token},signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw new Error('上次请求结果尚未确认，请稍后再次读取。');
  const outcome=(await response.json()).data;
  assertCurrent();
  if(!['COMMITTED','FAILED'].includes(outcome?.state)||!Number.isInteger(outcome.status)||outcome.status<200||outcome.status>599||
     !outcome.result||typeof outcome.result!=='object'||Array.isArray(outcome.result)||
     outcome.state==='COMMITTED'&&outcome.status>=300||outcome.state==='FAILED'&&outcome.status<400)throw new Error('上次请求结果尚未确认，请稍后再次读取。');
  return resultResponse({ok:outcome.status<400,status:outcome.status,headers:response.headers},outcome.result);
 }
 const performFetch=async (url,init={})=>{
  assertCurrent();
  if(typeof url!=='string'||!url.startsWith('/api/'))throw new Error('未知社区请求');
  const headers=new Headers(init.headers);
  const method=(init.method||'GET').toUpperCase();
  const mutation=!['GET','HEAD'].includes(method);
  const journaled=mutation&&!['/api/media-session','/api/ws-ticket','/api/user/logout'].includes(url);
  if(journaled&&journalProblem&&!restoreOperations())throw new Error(journalProblem);
  const key=method+' '+url;
  const signature=typeof init.body==='string'?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(init.body)))).map(byte=>byte.toString(16).padStart(2,'0')).join(''):init.body instanceof Blob?[init.body.size,init.body.type,init.body.name,init.body.lastModified].join(':'):'';
  assertCurrent();
  if(journaled&&uncertain.has(key)){const pending=uncertain.get(key),prior=await resolveOperation(pending.id);assertCurrent();completeOperation(key,pending.id);if(pending.signature!==signature)throw new Error('上次操作结果已确认，请先查看原帖或房间，再提交本次修改。');return prior;}
  const requestId=crypto.randomUUID();
  if(mutation)headers.set('x-request-id',requestId);
  assertCurrent();
  if(journaled){const next=new Map(uncertain);next.set(key,{id:requestId,signature,at:Date.now()});saveOperations(next);}
  let response;
  try{response=await globalThis.fetch(prefix+url,{...init,method,headers,signal:controller.signal,cache:'no-store'});}
  catch(error){assertCurrent();throw error;}
  assertCurrent();
  if(journaled&&response.status>=500){const resolved=await resolveOperation(requestId);assertCurrent();completeOperation(key,requestId);return resolved;}
  const json=await response.json();
  assertCurrent();
  if(response.ok&&(!json||typeof json!=='object'||!('data' in json)||!(json.code===200||json.success===true)))throw new Error('社区响应不完整，请核对操作结果。');
  if(journaled)completeOperation(key,requestId);
  return resultResponse(response,json);
 };
 const fetch=async(url,init={})=>{
  const reading=(init.method||'GET').toUpperCase()==='GET';
  if(reading){pendingReads++;updateReadiness();}
  try{return await performFetch(url,init);}
  finally{if(reading){pendingReads--;updateReadiness();}}
 };
 const menu=root.querySelector('#community-menu'), app=root.querySelector('#app-screen'), backdrop=root.querySelector('#community-menu-backdrop');
 function closeMenu(){app.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');backdrop.classList.add('hidden');}
 menu.addEventListener('click',()=>{const opened=app.classList.toggle('menu-open');menu.setAttribute('aria-expanded',String(opened));backdrop.classList.toggle('hidden',!opened);});
 backdrop.addEventListener('click',closeMenu);
 body.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
 const params=new URLSearchParams(globalThis.location.search);
 const views=['home','rooms','create','mine','favorites','coins','notifications','tags','profile','admin'];
 const initialView=views.includes(params.get('view'))?params.get('view'):'home';
 const context={document,window:instanceWindow,fetch,location:globalThis.location,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,
  disposed:inactive,isCancelled,runTask,guardEvent,assertCurrent,
  localStorage:{getItem:key=>key==='guohua_token'?options.token:null,setItem(){},removeItem(){}},
  signOut:()=>{if(!disposed&&options.isCurrent())options.signOut();}, initialView,
  present(scope,ready,regions=[scope]){presentations.get(scope)?.();for(const region of regions)region.hidden=false;const cancel=options.present?.(scope,ready,regions)||(()=>{});presentations.set(scope,cancel);},
  onView(view,previousView,ready=()=>true){
   if(inactive())return;
   closeMenu();const url=new URL(globalThis.location.href);url.searchParams.set('view',view);if(view!=='room')url.searchParams.delete('room');if(view!=='detail')url.searchParams.delete('post');globalThis.history.replaceState(globalThis.history.state,'',url);
   const main=body.querySelector('.main-content'),target=body.querySelector('#view-'+view);
   if(main&&target&&(view!==previousView||['preparing','error'].includes(target.dataset.contentPhase))){
    for(const [scope,stop] of presentations)if(scope!==main&&!target.contains(scope)){stop();presentations.delete(scope);}
    target.dataset.contentLabel='社区模块 '+view;context.present(main,ready,[target]);
   }
  },
  onRoom(id){if(inactive())return;const url=new URL(globalThis.location.href);url.searchParams.set('room',id);url.searchParams.delete('code');globalThis.history.replaceState(globalThis.history.state,'',url);},
  onPost(id){if(inactive())return;const url=new URL(globalThis.location.href);url.searchParams.set('post',String(id));globalThis.history.replaceState(globalThis.history.state,'',url);},
  onReady(){
   if(inactive())return;
   bootReady=true;updateReadiness();
   if(journalProblem)instanceWindow.communityApp.showNotice(journalProblem,'error');
   if(params.get('post'))void runTask(instanceWindow.communityApp.openDetail(Number(params.get('post'))));
   else if(params.get('room'))void runTask(instanceWindow.roomFeature.openRoom(params.get('room')));
   else if(params.get('code'))void runTask(instanceWindow.roomFeature.joinPrivate(params.get('code')));
  }
 };
 mountPosts(context);mountRooms(context);mountVoice(context);
 const disposeDrafts=installDrafts(body,context,options);
 setInterval(()=>{if(globalThis.document.visibilityState==='visible'&&navigator.onLine)void fetch('/api/media-session',{method:'POST',headers:{authorization:'Bearer '+options.token,'content-type':'application/json'},body:'{}'}).catch(()=>{});},10*60*1000);
 const cleanup=()=>{
  if(disposed)return;
  const errors=[];
  for(const stop of [...presentations.values(),disposeDrafts,()=>instanceWindow.roomVoice?.leave(),()=>instanceWindow.roomFeature?.leaveRoom()])try{stop();}catch(error){errors.push(error);}
  disposed=true;controller.abort();
  for(const id of timers)globalThis.clearTimeout(id);for(const id of intervals)globalThis.clearInterval(id);for(const id of frames)globalThis.cancelAnimationFrame(id);
  for(const args of listeners)globalThis.window.removeEventListener(...args);
  for(const media of body.querySelectorAll('audio,video')){
   try{
    media.pause();
    if(media.srcObject){for(const track of media.srcObject.getTracks?.()||[])track.stop();media.srcObject=null;}
    media.removeAttribute('src');for(const source of media.querySelectorAll('source'))source.removeAttribute('src');media.load();
   }catch(error){errors.push(error);}
  }
  for(const image of body.querySelectorAll('img[src^="blob:"]'))URL.revokeObjectURL(image.src);
  body.remove();style.remove();
  if(errors.length)queueMicrotask(()=>{throw new AggregateError(errors,'Community media cleanup failed');});
 };
 // React can unmount while the static resources are being fetched.
 if(!host.isConnected||!options.isCurrent())cleanup();
 return cleanup;
}
