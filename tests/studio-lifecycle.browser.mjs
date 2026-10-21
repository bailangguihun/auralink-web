/**
 * Real Studio/React browser regressions against an already-built loopback preview.
 * All API requests are intercepted synthetic fixtures. No provider or production call.
 * STUDIO_WEB_URL / STUDIO_API_URL must be exact loopback HTTP origins.
 * PLAYWRIGHT_MODULE may reference an existing Playwright install; writes evidence only
 * to STUDIO_BROWSER_OUTPUT, which must be outside the application worktree.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {newState,responseFor,id,png,wavFor} from './fixtures/studio-runtime.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=name=>{const u=new URL(process.env[name]);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert(!u.username&&!u.password&&!u.search&&!u.hash);return u.origin;};
const web=origin('STUDIO_WEB_URL'),api=origin('STUDIO_API_URL'),output=process.env.STUDIO_BROWSER_OUTPUT;
const buildId=(await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8')).trim();
const manifest=await fetch(`${web}/_next/static/${buildId}/_buildManifest.js`);assert.equal(manifest.status,200,'Running Next serves this exact build manifest');
assert(output,'Set a Git-external evidence directory');await mkdir(output,{recursive:true});
const result={startedAt:new Date().toISOString(),web,api,buildId,boundary:'Real production-built Studio React; every API fulfilled with synthetic local fixtures; no real generation or production business requests',cases:[],blocked:[],pageErrors:[],providerRequests:0,productionBusinessRequests:0};
const browser=await chromium.launch({headless:true});result.browser=browser.version();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message,ms=8000){const deadline=Date.now()+ms;while(Date.now()<deadline){if(await fn())return;await sleep(40);}assert.fail(message);}
async function scenario(name,fn,options={}){
 if(process.env.STUDIO_CASES&&!process.env.STUDIO_CASES.split(',').includes(name))return;
 const state=newState(options),record={name,checks:{}};result.cases.push(record);
 const context=await browser.newContext({viewport:{width:options.width||1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(origin=>{if(location.origin===origin)localStorage.setItem('artlive.session.token.v1','STUDIO_SYNTHETIC_BROWSER_TOKEN_NOT_A_JWT');},web);
 // Simulate a transport implementation that resolves after abort. This checks the
 // component's context/session gates, independently of native-fetch cancellation.
 if(options.ignoreAbort)await context.addInitScript(()=>{const real=window.fetch;window.fetch=(url,init)=>real(url,init?{...init,signal:undefined}:init);});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();
  if(u.origin===api){
   if(method==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':web,'access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}
   const response=responseFor(state,method,u,req.postData()?.startsWith('{')?req.postDataJSON():null);
   const body=Buffer.isBuffer(response.body)?response.body:JSON.stringify(response.body);
   if(response.delayMs)await sleep(response.delayMs);
   try{if(response.abort)await route.abort('failed');else await route.fulfill({status:response.status,contentType:response.contentType,headers:{'access-control-allow-origin':web,'cache-control':'no-store'},body});}catch{/* Page/context may deliberately close before a delayed synthetic response. */}
   return;
  }
  if(u.origin===web&&method==='GET')return route.continue();
  result.blocked.push({case:name,method,origin:u.origin,path:u.pathname});await route.abort();
 });
 const page=await context.newPage();page.on('dialog',dialog=>dialog.accept());page.setDefaultTimeout(10000);page.on('pageerror',e=>result.pageErrors.push({case:name,message:e.message}));
 const node=()=>page.locator('.workflow-node-output');
 const execute=()=>page.getByRole('button',{name:'执行全流程',exact:true});
 const open=async n=>{await page.getByRole('button',{name:'打开流程',exact:true}).click();await page.locator('[aria-label="打开已保存流程"]').getByRole('button',{name:new RegExp(`合成流程${n}`)}).click();await node().waitFor();await sleep(100);};
 const history=async n=>{await page.locator('.creation-card').filter({hasText:`合成历史${n}`}).click();await page.locator('#creation-detail-title').filter({hasText:`合成历史${n}`}).waitFor();};
 const choose=async n=>{await page.getByRole('button',{name:'从画廊选择',exact:true}).click();await page.locator('.gallery-picker-results').getByRole('button',{name:new RegExp(`合成国画${n}`)}).click();};
 const save=async()=>{const before=state.workflowWrites;await page.getByRole('button',{name:'保存流程',exact:true}).click();await until(()=>state.workflowWrites===before+1,'Expected exactly one workflow save');await until(async()=>await page.getByRole('button',{name:'保存流程',exact:true}).isEnabled(),'Save settled');await sleep(150);};
 const logout=async()=>{await page.getByRole('button',{name:'退出',exact:true}).click();await page.locator('.workflow-designer').waitFor({state:'detached'});};
 const clear=()=>page.getByRole('button',{name:'清空工作流',exact:true}).click();
 const audioReady=async locator=>{await locator.waitFor();await locator.evaluate(a=>new Promise((resolve,reject)=>{if(a.readyState>=1)return resolve();a.addEventListener('loadedmetadata',resolve,{once:true});a.addEventListener('error',()=>reject(Error('WAV decoding failed')),{once:true});}));};
 try{
  await page.goto(web+'/studio',{waitUntil:options.pendingLoad?'domcontentloaded':'networkidle'});
  if(options.pendingLoad)await page.locator('.workflow-designer').waitFor();
  record.buildId=await page.evaluate(()=>[...document.querySelectorAll('script[src]')].map(s=>s.src).find(x=>x.includes('/_next/static/'))||null);
  await fn({page,state,record,node,execute,open,history,choose,save,logout,clear,audioReady});
  assert.equal(result.pageErrors.filter(x=>x.case===name).length,0,'No browser runtime errors');record.status='PASS';
  await page.screenshot({path:`${output}/${name}.png`,fullPage:true});
 }catch(e){record.status='FAIL';record.error=String(e.stack);await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});}
 finally{record.submissions=state.submissionCount;record.workflowWrites=state.workflowWrites;record.detailReads=state.detailReads;record.requests=state.requests;await context.close();await writeFile(`${output}/BROWSER_RESULT.json`,JSON.stringify(result,null,2));console.log(`${record.status} ${name}${record.error?' '+record.error.split('\n')[0]:''}`);}
}
try{
 await scenario('history-does-not-populate-music-editor',async({page,record,open,history,node,execute})=>{
  await open(1);await history(11);assert.equal(await node().locator('img').count(),0);assert.equal(await page.locator('input[type=range]').count(),1);
  assert.equal(await page.locator('.creation-step-history').getByRole('heading',{name:'生成国画'}).count(),1);assert(await execute().isDisabled());
  record.checks={historicalPaintingRetained:true,currentMusicImageAbsent:true,durationVisible:true,missingInputDisabled:true};
 });
 await scenario('modified-save-does-not-resurrect-history',async({page,state,record,open,history,node,save})=>{
  await open(1);await history(11);await page.getByRole('button',{name:'删除输入节点并清空工作流',exact:true}).click();await page.getByRole('button',{name:/^国画节点/}).click();await page.getByRole('button',{name:/^音乐节点/}).click();await save();
  assert.equal(await node().locator('img').count(),0);assert.equal(await page.locator('input[type=range]').count(),1);assert.equal(state.workflows[0].operationSequence[0],'PAINTING_TO_MUSIC');assert.equal(await page.locator('#creation-detail-title').count(),1);record.checks.savedGraphChangedWithoutResultResurrection=true;
 },{music:false});
 await scenario('acknowledged-audio-controls-and-duration-invalidation',async({page,state,record,open,choose,node,execute,save,audioReady})=>{
  await open(1);await choose(90);await execute().click();await audioReady(node().locator('audio'));assert.equal(state.submissionCount,1);
  assert.equal(await page.locator('input[type=range]').count(),1);const info=await node().locator('audio').evaluate(a=>({duration:a.duration,controls:a.controls,blob:a.src.startsWith('blob:')}));assert.equal(info.duration,10);assert(info.controls&&info.blob);record.checks.audio=info;
  await page.locator('input[type=range]').fill('23');assert.equal(await node().locator('audio').count(),0);await save();assert.equal(await node().locator('audio').count(),0);assert.equal(await page.locator('input[type=range]').inputValue(),'23');
  await page.locator('.creation-card').filter({hasText:'合成已确认执行'}).click();await page.locator('.creation-step-history audio').waitFor();assert.equal(await page.locator('.creation-step-history').getByText('本次结果记录时长：10 秒',{exact:true}).count(),1);record.checks.changedDurationInvalidatesEditorButPreservesHistoricalTenSeconds=true;
 });
 await scenario('new-music-default-acknowledges-ten-second-audio',async({page,state,record,choose,execute,node,audioReady})=>{
  await page.getByRole('button',{name:/^国画节点/}).click();await page.getByRole('button',{name:/^音乐节点/}).click();await choose(90);await execute().click();await page.getByRole('dialog').getByLabel('流程名称').fill('合成默认时长流程');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();
  await audioReady(node().locator('audio'));assert.equal(state.submissionCount,1);assert.equal(await node().locator('audio').evaluate(a=>a.duration),10);assert.equal(await page.locator('input[type=range]').inputValue(),'10');record.checks.newWorkflowDefaultAudioTenSeconds=true;
 });
 for(const rejected of [{status:422,code:'CREATION_SOURCE_INVALID'},{status:503,code:'CREATION_QUEUE_FULL'}])await scenario(`definitive-${rejected.status}-does-not-become-uncertain`,async({page,state,record,open,choose,execute})=>{
  await open(1);await choose(90);await execute().click();await page.getByText('合成请求明确拒绝',{exact:true}).waitFor();await until(()=>execute().isEnabled(),'Definitive rejection permits a deliberate later submission');assert.equal(state.submissionCount,1);assert.equal(await page.getByText(/本登录会话已暂停新的创作提交/).count(),0);record.checks={knownAdmissionRejection:true,noAutomaticRetry:true};
 },{rejectSubmit:rejected});
 await scenario('source-replacement-invalidates-acknowledged-audio',async({page,record,open,choose,node,execute,audioReady})=>{
  await open(1);await choose(90);await execute().click();await audioReady(node().locator('audio'));await page.getByRole('button',{name:'更换国画',exact:true}).click();assert.equal(await node().locator('audio').count(),0);await choose(91);assert.equal(await node().locator('audio').count(),0);await open(2);assert.equal(await node().locator('audio').count(),0);assert.equal(await page.getByText('合成国画91',{exact:true}).count(),0);record.checks.sourceAndDifferentWorkflowInvalidate=true;
 });
 await scenario('save-preserves-text-and-same-workflow-draft',async({page,record,open,save})=>{
  await open(1);await page.getByLabel('画面描述').fill('合成输入：普通保存应保留这段文字');await save();assert.equal(await page.getByLabel('画面描述').inputValue(),'合成输入：普通保存应保留这段文字');
  await page.getByLabel('画面描述').fill('未保存的合成编辑');await open(1);assert.equal(await page.getByLabel('画面描述').inputValue(),'未保存的合成编辑');record.checks.compatibleTextAndSameWorkflowDraftPreserved=true;
 },{music:false});
 await scenario('save-preserves-catalog-source',async({page,record,open,choose,save,execute})=>{
  await open(1);await choose(90);await save();assert.equal(await page.getByText('合成国画90',{exact:true}).count(),1);assert(await execute().isEnabled());record.checks.catalogSourcePreserved=true;
 });
 await scenario('save-success-list-refresh-failure-does-not-duplicate',async({page,state,record,open,save})=>{
  await open(1);await page.getByLabel('画面描述').fill('合成输入保持');state.failListAfterSave=true;await save();assert.equal(await page.getByLabel('画面描述').inputValue(),'合成输入保持');
  assert.match(await page.locator('main').innerText(),/已保存|保存成功/);assert.match(await page.locator('main').innerText(),/列表/);assert(!/保存结果暂时无法确认/.test(await page.locator('main').innerText()));await save();assert.equal(state.workflowWrites,2);assert.equal(state.workflows.length,2);record.checks.savedIdentityRetainedWithSeparateRefreshError=true;
 },{music:false});
 await scenario('definitive-workflow-422-preserves-editable-save-state',async({page,state,record,open,save})=>{
  await open(1);await page.getByLabel('画面描述').fill('合成可修正草稿');state.rejectSave=true;
  const codes=['WORKFLOW_INVALID','WORKFLOW_SCHEMA_UNSUPPORTED','WORKFLOW_GRAPH_TOO_LARGE'];for(const code of codes){state.rejectSaveCode=code;const before=state.workflowWrites;await page.getByRole('button',{name:'保存流程',exact:true}).click();await until(()=>state.workflowWrites===before+1,'Definitive validation save received');await page.getByText('合成流程明确拒绝',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'保存流程',exact:true}).isEnabled());assert.equal(await page.getByText(/保存结果未确认/).count(),0);}
  assert.equal(state.workflowWrites,3);state.rejectSave=false;await save();assert.equal(state.workflowWrites,4);assert.equal(state.workflows.length,2);assert.equal(state.submissionCount,0);record.checks={codes,definitiveValidationRejectionNotUncertain:true,deliberateCorrectedSaveAllowed:true};
 },{music:false});
 await scenario('unresolved-save-500-remains-guarded-after-list-refresh',async({page,state,record,open})=>{
  await open(1);await page.getByLabel('画面描述').fill('合成未确认保存');state.rejectSave=true;state.rejectSaveStatus=500;state.rejectSaveCode='INTERNAL_ERROR';await page.getByRole('button',{name:'保存流程',exact:true}).click();await page.getByText(/保存结果未确认/).waitFor();assert(await page.getByRole('button',{name:'保存流程',exact:true}).isDisabled());await page.getByRole('button',{name:'打开流程',exact:true}).click();await page.getByRole('button',{name:'重新读取流程',exact:true}).click();await page.waitForTimeout(150);assert(await page.getByRole('button',{name:'保存流程',exact:true}).isDisabled());assert.equal(state.workflowWrites,1);record.checks={unknownSaveRetainsGuard:true,listSuccessIsNotSaveAcknowledgement:true};
 },{music:false});
 await scenario('workflow-load-failure-cannot-save-previous-editor',async({page,state,record,open})=>{
  await open(1);state.failWorkflowId=id(2);await page.getByRole('button',{name:'打开流程',exact:true}).click();await page.locator('[aria-label="打开已保存流程"]').getByRole('button',{name:/合成流程2/}).click();await page.getByText(/合成流程详情故障/).waitFor();
  assert(await page.getByRole('button',{name:'保存流程',exact:true}).isDisabled());assert.equal(state.workflowWrites,0);record.checks.previousEditorCannotBecomeNewSaveTarget=true;
 });
 await scenario('late-history-after-clear-is-rejected',async({page,state,record,open,clear})=>{
  await open(1);state.delayHistory=500;await page.locator('.creation-card').filter({hasText:'合成历史11'}).click();await clear();await sleep(750);assert.equal(await page.locator('#creation-detail-title').count(),0);assert.equal(await page.locator('.workflow-node-output').count(),0);record.checks.lateDetailDidNotRestoreClearedSelection=true;
 },{ignoreAbort:true});
 await scenario('late-workflow-response-after-clear-is-rejected',async({page,state,record,clear})=>{
  state.delayWorkflow=500;await page.getByRole('button',{name:'打开流程',exact:true}).click();await page.locator('[aria-label="打开已保存流程"]').getByRole('button',{name:/合成流程1/}).click();await clear();await sleep(750);assert.equal(await page.locator('.workflow-node-output').count(),0);record.checks.lateWorkflowDidNotRestoreClearedEditor=true;
 },{ignoreAbort:true});
 await scenario('late-gallery-results-cannot-replace-new-context',async({page,state,record,open,clear})=>{
  await open(1);state.delayGallery=600;await page.getByRole('button',{name:'从画廊选择',exact:true}).click();await until(()=>state.requests.some(r=>r.path==='/api/v1/paintings'),'First gallery read started');await clear();await open(2);state.delayGallery=0;state.galleryPrefix='新候选';await page.getByRole('button',{name:'从画廊选择',exact:true}).click();await page.locator('.gallery-picker-results').getByRole('button',{name:/新候选90/}).waitFor();await page.waitForTimeout(800);assert.equal(await page.locator('.gallery-picker-results').getByRole('button',{name:/合成国画90/}).count(),0);assert.equal(await page.locator('.gallery-picker-results').getByRole('button',{name:/新候选90/}).count(),1);record.checks.oldGalleryResponseRejectedAfterAbortAndContextChange=true;
 },{ignoreAbort:true});
 await scenario('late-save-after-normal-logout-cannot-restore-editor',async({page,state,record,open,logout})=>{
  await open(1);await page.getByLabel('画面描述').fill('合成延迟保存');state.delaySave=600;await page.getByRole('button',{name:'保存流程',exact:true}).click();await until(()=>state.workflowWrites===1,'Save request actually received');await logout();await page.waitForTimeout(850);assert.equal(await page.locator('.workflow-designer').count(),0);assert.equal(state.submissionCount,0);record.checks.lateAcknowledgedSaveNotAppliedAfterLogout=true;
 },{music:false,ignoreAbort:true});
 await scenario('late-poll-after-context-change-cannot-populate-editor',async({page,state,record,open,choose,node,execute,clear})=>{
  await open(1);await choose(90);state.delayHistory=600;await execute().click();await until(()=>state.detailReads>=1,'Expected acknowledged execution poll');await clear();await sleep(850);assert.equal(await node().count(),0);assert.equal(state.submissionCount,1);record.checks.pollCannotRestoreInvalidatedEditor=true;
 },{ignoreAbort:true});
 await scenario('uncertain-submit-blocks-button-edits-open-new-and-remount',async({page,state,record,open,execute,save,clear})=>{
  await open(1);await page.getByLabel('画面描述').fill('合成提交，确认将丢失');await execute().click();await page.getByText(/创作提交结果暂时无法确认/).first().waitFor();assert.equal(state.submissionCount,1);assert(await execute().isDisabled());
  await page.getByLabel('画面描述').fill('编辑不能解除未确认提交');assert(await execute().isDisabled());await save();assert(await execute().isDisabled());await clear();await open(1);await page.getByLabel('画面描述').fill('打开或清空同样不能解除');assert(await execute().isDisabled());
  // Even a synthetic event sent to the real React button must reach no POST.
  await execute().evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});await sleep(200);assert.equal(state.submissionCount,1);await page.locator('#primary-navigation').getByRole('link',{name:'关于',exact:true}).click();await page.locator('.workflow-designer').waitFor({state:'detached'});await page.locator('#primary-navigation').getByRole('link',{name:'工坊',exact:true}).click();await page.locator('.workflow-designer').waitFor();await open(1);await page.getByLabel('画面描述').fill('同一登录会话重新挂载后');assert(await execute().isDisabled());assert.equal(state.submissionCount,1);record.checks.unresolvedGuardSurvivesEditorSaveAndSpaRemount=true;
 },{music:false,failSubmit:true});
 await scenario('rapid-double-click-one-acknowledged-submission',async({page,state,record,open,choose,execute,node,audioReady})=>{
  await open(1);await choose(90);await execute().evaluate(el=>{el.click();el.click();});await audioReady(node().locator('audio'));assert.equal(state.submissionCount,1);record.checks.twoSynchronousClicksOnePost=true;
 },{delaySave:120,delaySubmit:120});
 await scenario('fast-ack-second-mouse-click-does-not-resubmit-before-poll',async({page,state,record,open,choose,execute,node,audioReady})=>{
  await open(1);await choose(90);const button=execute();await button.click();await until(()=>state.submissionCount===1,'First submission dispatched');await page.waitForTimeout(100);assert.equal(state.detailReads,0,'Second click must precede initial polling');assert(await button.isDisabled(),'An ACK awaiting run observation must not re-arm the editor');
  // Real pointer input on the same button, not a force-click or helper-only call.
  const box=await button.boundingBox();assert(box&&box.y>=0);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(100);assert.equal(state.submissionCount,1);await audioReady(node().locator('audio'));assert(await button.isEnabled());record.checks={realMouseSecondClick:true,postAckBeforeInitialPoll:true,knownTerminalReenables:true};
 });
 for(const reverse of [false,true])await scenario(reverse?'old-history-detail-cannot-regress-current-terminal':'old-current-poll-cannot-regress-history-terminal',async({page,state,record,open,choose,execute,node,audioReady})=>{
  await open(1);await choose(90);state.detailDelays=[reverse?2200:1300,0];await execute().click();
  const view=page.getByRole('button',{name:'在历史区查看本次执行',exact:true});
  if(reverse)await view.click();
  await until(()=>state.detailReads>=1,'Older RUNNING snapshot request must actually start');
  state.creations[0].status='SUCCEEDED';state.creations[0].steps[0].status='SUCCEEDED';
  if(!reverse)await view.click();
  await audioReady(node().locator('audio'));assert(await execute().isEnabled(),'New terminal enables a deliberate later run');
  await sleep(1450);assert.equal(await node().locator('audio').count(),1,'Delayed old RUNNING must not erase current terminal output');
  assert(await execute().isEnabled(),'Delayed old RUNNING must not re-lock the acknowledged terminal');
  assert.equal(await page.locator('.creation-detail > header .creation-status').innerText(),'已完成','History also retains the latest terminal observation');
  assert.equal(state.submissionCount,1);record.checks={reverseOrder:reverse,sameAckSameRetryVersion:true,lateRunningRejected:true,currentAndHistoryTerminalPreserved:true,syntheticPosts:1};
 },{running:true,ignoreAbort:true});
 await scenario('unknown-acknowledged-state-keeps-guard-until-new-context',async({page,state,record,open,choose,execute})=>{
  await open(1);await choose(90);await execute().click();await until(()=>state.detailReads>=1,'Expected observed unknown run status');await page.waitForTimeout(100);assert(await execute().isDisabled(),'Unknown run status is not terminal');
  await page.locator('input[type=range]').fill('11');assert(await execute().isEnabled(),'Deliberate new parameter context can prepare a new execution');assert.equal(state.submissionCount,1);record.checks={unknownStatusRetainsGuard:true,newContextCanPrepareWithoutAutomaticPost:true};
 },{unknownStatus:true});
 await scenario('explicit-same-ack-terminal-read-resolves-observation-guard',async({page,state,record,open,choose,execute,node,audioReady})=>{
  await open(1);await choose(90);await execute().click();await until(()=>state.detailReads>=1,'Unknown acknowledged detail was observed');await page.waitForTimeout(100);assert(await execute().isDisabled());state.creations[0].status='SUCCEEDED';state.creations[0].steps[0].status='SUCCEEDED';await page.locator('.creation-card').filter({hasText:'合成已确认执行'}).click();await audioReady(node().locator('audio'));assert(await execute().isEnabled());assert.equal(state.submissionCount,1);
  await page.locator('input[type=range]').fill('11');await page.getByRole('button',{name:'刷新详情',exact:true}).click();await page.waitForTimeout(150);assert.equal(await node().locator('audio').count(),0);assert.equal(await page.locator('.creation-step-history audio').count(),1);record.checks={sameAcknowledgedIdTerminalGetReconciles:true,historyReadAfterInputChangeDoesNotResurrect:true,noAdditionalSubmission:true};
 },{unknownStatus:true});
 await scenario('mismatched-step-cannot-render-as-current-music',async({page,state,record,open,choose,execute,node})=>{
  await open(1);await choose(90);await execute().click();await until(()=>state.detailReads>=1,'Expected one acknowledged detail');await sleep(250);assert.equal(await node().locator('img').count(),0);assert.equal(await node().locator('audio').count(),0);assert.equal(await page.locator('input[type=range]').count(),1);record.checks.operationAndModalityMismatchRejected=true;
 },{mismatchedStep:true});
 await scenario('history-failure-is-not-empty',async({page,record})=>{
  await page.getByText('合成作品列表故障',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'还没有作品'}).count(),0);record.checks.failedNotEmpty=true;
 },{listFailure:true});
 await scenario('history-loading-is-not-empty',async({page,record})=>{
  // A long pending list remains loading while the editor can load independently.
  assert.equal(await page.getByRole('heading',{name:'还没有作品'}).count(),0);record.checks.pendingNotEmpty=true;
 },{delayList:3000,pendingLoad:true});
 await scenario('successful-empty-history-shows-empty',async({page,record})=>{
  await page.getByRole('heading',{name:'还没有作品'}).waitFor();record.checks.confirmedEmptyVisible=true;
 },{creations:[]});
 await scenario('audio-unavailable-message-does-not-call-it-image',async({page,record,open,history})=>{
  await open(1);await history(12);await until(async()=>/音频.*(不可用|无法)|音乐.*(不可用|无法)/.test(await page.locator('.creation-step-history').innerText()),'Expected audio-specific unavailable message');assert(!/图片暂不可用/.test(await page.locator('.creation-step-history').innerText()));record.checks.audioSpecificFailure=true;
 },{mediaStatus:404});
 await scenario('logout-rejects-late-history-and-media',async({page,state,record,open,logout})=>{
  await open(1);state.delayHistory=500;state.delayMedia=500;await page.locator('.creation-card').filter({hasText:'合成历史12'}).click();await logout();await sleep(800);assert.equal(await page.locator('.creation-media-preview,audio,#creation-detail-title').count(),0);record.checks.noLatePrivateContentAfterLogout=true;
 },{ignoreAbort:true});
 await scenario('late-media-after-normal-logout-is-rejected',async({page,state,record,open,history,logout})=>{
  await open(1);state.delayMedia=600;await history(12);await until(()=>state.requests.some(r=>r.path.includes(id(51))),'Audio content request actually started');await logout();await sleep(850);assert.equal(await page.locator('audio,.creation-media-preview,#creation-detail-title').count(),0);record.checks.startedMediaResponseRejectedAfterLogout=true;
 },{ignoreAbort:true});
 await scenario('late-audio-media-cannot-overwrite-other-history',async({page,state,record,open,history})=>{
  await open(1);state.delayMedia=600;await history(12);await until(()=>state.requests.some(r=>r.path.includes(id(51))),'Audio content request actually started');await history(11);await sleep(850);assert.equal(await page.locator('.creation-step-history audio').count(),0);assert.equal(await page.locator('.creation-step-history img').count(),1);record.checks.otherHistoricalSelectionRetained=true;
 },{ignoreAbort:true});
 await scenario('invalid-wav-has-audio-playback-error',async({page,record,open,history})=>{
  await open(1);await history(12);await page.locator('.creation-step-history').getByText('此音频暂时无法播放；作品记录已保留。',{exact:true}).waitFor();assert.equal(await page.locator('.creation-step-history audio').count(),0);record.checks.decodeFailureClassifiedAsAudio=true;
 },{invalidAudio:true});
 await scenario('save-preserves-selected-local-file',async({page,record,open,save})=>{
  await open(1);const input=page.locator('.workflow-painting-input input[type=file]'),file={name:'synthetic.png',mimeType:'image/png',buffer:png};await input.setInputFiles(file);const view=page.getByAltText('待使用的本地国画预览');await view.waitFor();const before=await view.getAttribute('src');await save();assert.equal(await view.getAttribute('src'),before);assert.equal(await view.evaluate(i=>i.naturalWidth),1);
  const bytes=await view.evaluate(async i=>[...new Uint8Array(await (await fetch(i.src)).arrayBuffer())]);assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'),createHash('sha256').update(png).digest('hex'));
  // The native input is intentionally cleared after File capture so choosing the
  // same file again fires change. React owns the retained file and preview bytes.
  assert.equal(await input.inputValue(),'');await input.setInputFiles(file);await until(async()=>await view.getAttribute('src')!==before,'Same-file reselection should establish a new preview');record.checks={localFileBytesPreservedAcrossSave:true,sameFileReselection:true,sha256:createHash('sha256').update(Buffer.from(bytes)).digest('hex')};
 });
 await scenario('intentional-upload-music-restriction-and-duration-bounds',async({page,record,open,execute})=>{
  await open(1);const slider=page.locator('input[type=range]');assert.equal(await slider.getAttribute('min'),'3');assert.equal(await slider.getAttribute('max'),'30');await page.locator('.workflow-painting-input input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
  await page.getByText('本轮音乐创作仅支持从画廊选择一幅国画；上传国画和生成国画暂不能用于音乐。',{exact:true}).waitFor();assert(await execute().isDisabled());assert(await slider.isEnabled());record.checks.intentionalRestrictionAndBoundsPreserved=true;
 });
 await scenario('capability-failure-is-distinct-from-empty-history',async({page,record})=>{await page.getByRole('heading',{name:'工作流暂时无法显示'}).waitFor();record.checks.explicitCapabilityFailure=true;},{capStatus:503});
 for(const width of [1440,390])await scenario(`layout-${width}`,async({page,record,open,history,choose,node})=>{
  await open(1);await history(11);await choose(90);const range=page.locator('input[type=range]');await range.focus();await page.keyboard.press('ArrowRight');assert.equal(await range.inputValue(),'11');assert.equal(await node().locator('img').count(),0);
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert(size.document<=size.viewport+1,JSON.stringify(size));record.checks={size,keyboardDuration:true,historySeparate:true};
 },{width});
}finally{
 await browser.close();result.finishedAt=new Date().toISOString();result.summary={passed:result.cases.filter(x=>x.status==='PASS').length,failed:result.cases.filter(x=>x.status!=='PASS').length};
 result.syntheticMedia={pngSha256:createHash('sha256').update(png).digest('hex'),wavSha256:createHash('sha256').update(wavFor()).digest('hex'),wavDurationSeconds:10};
 await writeFile(`${output}/BROWSER_RESULT.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result.summary));if(result.summary.failed)process.exitCode=1;
}
