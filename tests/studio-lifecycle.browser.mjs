/** Production-built Studio with intercepted synthetic APIs only. No real generation. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {newState,responseFor,id,png,wavFor} from './fixtures/studio-runtime.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=name=>{const u=new URL(process.env[name]);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert(!u.username&&!u.password&&!u.search&&!u.hash);return u.origin;};
const web=origin('STUDIO_WEB_URL'),api=origin('STUDIO_API_URL'),output=process.env.STUDIO_BROWSER_OUTPUT;
const buildId=(await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8')).trim();
assert.equal((await fetch(`${web}/_next/static/${buildId}/_buildManifest.js`)).status,200,'Preview serves this build');
assert(output,'Set a Git-external evidence directory');await mkdir(output,{recursive:true});
const result={startedAt:new Date().toISOString(),web,api,buildId,boundary:'Production-built React; intercepted synthetic APIs only; Browser plugin unavailable, existing Playwright used; no real generation or production writes',cases:[],blocked:[],pageErrors:[],consoleErrors:[]};
const browser=await chromium.launch({headless:true});result.browser=browser.version();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message,ms=10000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(40);}assert.fail(message);}
async function scenario(name,fn,options={}){
 if(process.env.STUDIO_CASES&&!process.env.STUDIO_CASES.split(',').includes(name))return;
 const state=newState(options),record={name,checks:{}};result.cases.push(record);
 const context=await browser.newContext({viewport:{width:options.width||1440,height:options.height||1000},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(origin=>{if(location.origin===origin)localStorage.setItem('artlive.session.token.v1','STUDIO_SYNTHETIC_BROWSER_TOKEN_NOT_A_JWT');},web);
 if(options.ignoreAbort)await context.addInitScript(()=>{const real=window.fetch;window.fetch=(u,o)=>real(u,o?{...o,signal:undefined}:o);});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();
  if(u.origin===api){
   const headers={'access-control-allow-origin':web,'access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type','cache-control':'no-store'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers});
   const response=responseFor(state,method,u,req.postData()?.startsWith('{')?req.postDataJSON():null);
   if(response.delayMs)await sleep(response.delayMs);
   try{if(response.abort)await route.abort('failed');else await route.fulfill({status:response.status,contentType:response.contentType,headers,body:Buffer.isBuffer(response.body)?response.body:JSON.stringify(response.body)});}catch{/* Deliberately closed/aborted contexts may have a delayed fixture response. */}
   return;
  }
  if(u.origin===web&&method==='GET')return route.continue();
  if(u.hostname==='res.wx.qq.com')return route.fulfill({contentType:'application/javascript',body:'/* inert isolated shell */'});
  result.blocked.push({case:name,method,origin:u.origin,path:u.pathname});await route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('dialog',d=>d.accept());
 page.on('pageerror',e=>result.pageErrors.push({case:name,message:e.message}));
 page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push({case:name,message:m.text()});});
 const execute=()=>page.getByRole('button',{name:'执行流程',exact:true});
 const node=()=>page.locator('.workflow-node-output');
 const modal=()=>page.getByRole('dialog',{name:'为本次创作命名',exact:true});
 const add=label=>page.locator('.workflow-toolbar').getByRole('button',{name:new RegExp(`^${label}节点`)}).click();
 const clear=()=>page.getByRole('button',{name:'清空流程',exact:true}).click();
 const configure=async(kind='music')=>{
  if(await page.locator('.workflow-node-source').count())await clear();
  await add(kind==='text'?'文字':kind==='poem'?'古诗':kind==='image'?'图像':'国画');
  await add(kind==='music'?'音乐':'国画');await node().waitFor();
 };
 const choose=async(n=90)=>{await page.getByRole('button',{name:'从画廊选择',exact:true}).click();await page.locator('.gallery-picker-results').getByRole('button',{name:new RegExp(`合成国画${n}`)}).click();};
 const prompt=async()=>{await execute().click();await modal().waitFor();return modal();};
 const run=async(name='合成已确认执行')=>{const dialog=await prompt();await dialog.getByLabel('本次名称',{exact:true}).fill(name);await dialog.getByRole('button',{name:'开始执行',exact:true}).click();};
 const history=async(n=11)=>{await page.locator('.creation-card').filter({hasText:`合成历史${n}`}).click();await page.locator('#creation-detail-title').filter({hasText:`合成历史${n}`}).waitFor();};
 const logout=async()=>{await page.getByRole('button',{name:'退出',exact:true}).click();await page.locator('.workflow-designer').waitFor({state:'detached'});};
 const audioReady=async(locator=node().locator('audio'))=>{await locator.waitFor();await locator.evaluate(a=>new Promise((resolve,reject)=>{if(a.readyState>=1)return resolve();a.addEventListener('loadedmetadata',resolve,{once:true});a.addEventListener('error',()=>reject(Error('Fixture WAV decode failed')),{once:true});}));};
 const shot=async suffix=>page.screenshot({path:`${output}/${name}-${suffix}.png`,fullPage:false});
 try{
  await page.goto(`${web}/studio`,{waitUntil:options.pendingLoad?'domcontentloaded':'networkidle'});await page.locator('.workflow-designer').waitFor();
  assert.equal(new URL(page.url()).pathname,'/studio');assert.match(await page.title(),/工坊|创作/);
  await fn({page,state,record,execute,node,modal,add,clear,configure,choose,prompt,run,history,logout,audioReady,shot});
  assert.equal(result.pageErrors.filter(e=>e.case===name).length,0,'No runtime exception');record.status='PASS';await shot('result');
 }catch(e){record.status='FAIL';record.error=String(e.stack);await shot('failure').catch(()=>{});}
 finally{record.workflowWrites=state.workflowWrites;record.submissions=state.submissionCount;record.uploads=state.uploadCount||0;record.requests=state.requests;await context.close();await writeFile(`${output}/BROWSER_RESULT.json`,JSON.stringify(result,null,2));console.log(`${record.status} ${name}${record.error?' '+record.error.split('\n')[0]:''}`);}
}
try{
 await scenario('simple-toolbar-and-empty-inputs',async({page,state,record,execute,configure,add,clear})=>{
  assert.equal(await page.getByRole('button',{name:'打开流程',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'保存流程',exact:true}).count(),0);assert(await execute().isDisabled());
  await add('文字');await page.getByLabel('画面描述').fill('只有输入还不能执行');assert(await execute().isDisabled());await add('国画');assert(await execute().isEnabled());
  for(const kind of ['text','poem','image','music']){await configure(kind);assert(await execute().isDisabled());if(kind==='text'||kind==='poem'){const input=page.getByLabel(kind==='text'?'画面描述':'古诗内容');await input.fill('  \n  ');assert(await execute().isDisabled());await input.fill('有效创作输入');assert(await execute().isEnabled());}}
  await clear();assert.equal(state.workflowWrites,0);assert.equal(state.submissionCount,0);assert.equal(state.requests.filter(r=>r.path==='/api/v1/me/workflows').length,0);record.checks={twoActions:true,inputAndStepRequired:true,whitespaceRejected:true,noWorkflowList:true};
 });
 for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'tablet',width:1194,height:700},{name:'mobile',width:390,height:844}])await scenario(`naming-modal-${viewport.name}`,async({page,state,record,configure,prompt,modal,execute,shot})=>{
  await configure('text');await page.getByLabel('画面描述').fill('取消后仍需保留的创作内容');
  await execute().scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo({top:120,behavior:'instant'}));const scroll=await page.evaluate(()=>({y:scrollY,htmlStyle:document.documentElement.style.cssText,bodyStyle:document.body.style.cssText,htmlStyleAttribute:document.documentElement.getAttribute('style'),bodyStyleAttribute:document.body.getAttribute('style')}));record.checks.pageBefore=scroll;assert(scroll.y>0,'Exercise restoration from a scrolled page');const executeBox=await execute().boundingBox();assert(executeBox&&executeBox.y>=0&&executeBox.y+executeBox.height<=viewport.height,'Execute is visible without scrolling');await page.mouse.click(executeBox.x+executeBox.width/2,executeBox.y+executeBox.height/2);const dialog=modal();await dialog.waitFor();record.checks.modalBodyTop=await page.evaluate(()=>document.body.style.top);
  const input=dialog.getByLabel('本次名称',{exact:true}),confirm=dialog.getByRole('button',{name:'开始执行',exact:true}),cancel=dialog.getByRole('button',{name:'取消',exact:true});assert.equal(await input.inputValue(),'');assert(await input.evaluate(e=>e===document.activeElement));assert(await confirm.isDisabled());await execute().evaluate(e=>e.focus());assert(await input.evaluate(e=>e===document.activeElement),'Background controls cannot receive focus while modal is open');
  await input.press('Shift+Tab');assert(await cancel.evaluate(e=>e===document.activeElement),'Reverse Tab skips disabled confirmation and wraps to cancel');await page.keyboard.press('Tab');assert(await input.evaluate(e=>e===document.activeElement),'Tab wraps to input when confirmation is disabled');
  await input.fill('   ');assert(await confirm.isDisabled());await dialog.locator('form').evaluate(form=>form.requestSubmit());assert.equal(state.workflowWrites,0);assert.equal(state.submissionCount,0);await input.fill('秋山听雨');assert(await confirm.isEnabled());await input.press('Shift+Tab');assert(await confirm.evaluate(e=>e===document.activeElement),'Reverse Tab wraps to enabled confirmation');await page.keyboard.press('Tab');assert(await input.evaluate(e=>e===document.activeElement),'Tab wraps from confirmation to input');
  const geometry=await dialog.evaluate(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e),backdrop=getComputedStyle(e,'::backdrop');return {x:r.x,y:r.y,w:r.width,h:r.height,innerWidth,innerHeight,opacity:c.opacity,background:c.backgroundColor,backdrop:backdrop.backgroundColor}});
  assert(Math.abs(geometry.x+geometry.w/2-geometry.innerWidth/2)<=2);assert(Math.abs(geometry.y+geometry.h/2-geometry.innerHeight/2)<=2);assert(geometry.x>=0&&geometry.y>=0&&geometry.w<=geometry.innerWidth&&geometry.h<=geometry.innerHeight);assert.equal(geometry.opacity,'1');assert(!/rgba\(0, 0, 0, 0\)/.test(geometry.backdrop));
  record.checks.tabFocus=[];for(let i=0;i<6;i++){await page.keyboard.press('Tab');const focus=await dialog.evaluate(e=>({within:e.contains(document.activeElement),tag:document.activeElement?.tagName,id:document.activeElement?.id,text:document.activeElement?.textContent?.slice(0,120)}));record.checks.tabFocus.push(focus);assert(focus.within,`Focus remains in dialog; Tab ${i+1} active ${focus.tag}#${focus.id}`);}
  const beforeWheel=await page.evaluate(()=>scrollY);await page.mouse.move(5,5);await page.mouse.wheel(0,600);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>scrollY),beforeWheel,'Backdrop locks background scrolling');
  await shot('modal');if(viewport.name==='mobile'){await page.setViewportSize({width:390,height:440});await page.waitForFunction(()=>{const d=document.querySelector('dialog[open]');const r=d?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=innerHeight});await shot('keyboard-height');await page.setViewportSize({width:390,height:844});}await page.keyboard.press('Escape');await modal().waitFor({state:'detached'});assert(await execute().evaluate(e=>e===document.activeElement));assert.equal(await page.getByLabel('画面描述').inputValue(),'取消后仍需保留的创作内容');
  record.checks.pageAfter=await page.evaluate(()=>({y:scrollY,htmlStyle:document.documentElement.style.cssText,bodyStyle:document.body.style.cssText,htmlStyleAttribute:document.documentElement.getAttribute('style'),bodyStyleAttribute:document.body.getAttribute('style')}));assert.equal(record.checks.pageAfter.htmlStyle,scroll.htmlStyle);assert.equal(record.checks.pageAfter.bodyStyle,scroll.bodyStyle);assert(Math.abs(record.checks.pageAfter.y-scroll.y)<=1,'Closing restores background scroll position');
  await prompt();await modal().getByRole('button',{name:'取消',exact:true}).click();await modal().waitFor({state:'detached'});await prompt();await page.mouse.click(5,5);await modal().waitFor({state:'detached'});assert.equal(state.workflowWrites,0);assert.equal(state.uploadCount||0,0);assert.equal(state.submissionCount,0);record.checks={...record.checks,geometry,cancelEscapeAndBackdropNoWrites:true,focusTrapAndRestore:true,disabledConfirmationSkipped:true,reverseTabWrapped:true,backgroundLocked:true};
 },viewport);
 await scenario('name-enter-ime-and-duplicate-confirmation',async({page,state,record,configure,prompt,node})=>{
  await configure('text');await page.getByLabel('画面描述').fill('合成文本输入');const dialog=await prompt(),input=dialog.getByLabel('本次名称',{exact:true});
  await input.fill('春山');await input.dispatchEvent('compositionstart');await input.press('Enter');assert.equal(state.workflowWrites,0);assert.equal(state.submissionCount,0);assert(await dialog.isVisible());await input.dispatchEvent('compositionend');
  await input.press('Enter');await node().locator('img').waitFor();assert.equal(state.workflowWrites,1);assert.equal(state.submissionCount,1);assert.equal(state.creations[0].workflowName,'春山');record.checks={imeDoesNotSubmit:true,enterConfirms:true,oneExecution:true};
 });
 await scenario('every-run-name-and-historical-snapshot',async({page,state,record,configure,run,prompt,node})=>{
  await configure('text');await page.getByLabel('画面描述').fill('第一轮输入');await run('  第一幅秋山  ');await node().locator('img').waitFor();const first=structuredClone(state.creations[0]);
  await page.getByLabel('画面描述').fill('第二轮输入');const dialog=await prompt();assert.equal(await dialog.getByLabel('本次名称',{exact:true}).inputValue(),'');await dialog.getByLabel('本次名称',{exact:true}).fill('第二幅春水');await dialog.getByRole('button',{name:'开始执行',exact:true}).click();await until(()=>state.submissionCount===2,'Second deliberate run');await node().locator('img').waitFor();
  assert.equal(state.creations[0].workflowName,'第二幅春水');assert.equal(state.creations.find(c=>c.creationId===first.creationId).workflowName,'第一幅秋山');assert.equal(state.creations[0].workflowId,first.workflowId);assert.equal(await page.getByLabel('画面描述').inputValue(),'第二轮输入');assert.equal(state.requests.filter(r=>r.path==='/api/v1/me/workflows'&&r.method==='GET').length,0);record.checks={everyRunPrompts:true,namesAreSnapshots:true,sourcePreserved:true,noListRefreshDependency:true};
 });
 await scenario('rapid-double-confirm-only-one-submission',async({page,state,record,configure,choose,prompt,node,audioReady})=>{
  await configure();await choose();const dialog=await prompt();await dialog.getByLabel('本次名称',{exact:true}).fill('一次创作');await dialog.getByRole('button',{name:'开始执行',exact:true}).evaluate(e=>{e.click();e.click();});await audioReady(node().locator('audio'));assert.equal(state.workflowWrites,1);assert.equal(state.submissionCount,1);record.checks.twoSynchronousConfirmClicksOnePost=true;
 },{delaySave:120,delaySubmit:120});
 await scenario('history-does-not-populate-music-editor',async({page,record,configure,history,node,execute})=>{
  await configure();await history();assert.equal(await node().locator('img').count(),0);assert.equal(await page.locator('input[type=range]').count(),1);assert.equal(await page.locator('.creation-step-history').getByRole('heading',{name:'生成国画'}).count(),1);assert(await execute().isDisabled());record.checks.historyIndependentFromInput=true;
 });
 await scenario('audio-duration-change-invalidates-current-only',async({page,state,record,configure,choose,run,node,audioReady})=>{
  await configure();await choose();await run();await audioReady();assert.equal(await node().locator('audio').evaluate(a=>a.duration),10);
  await page.locator('input[type=range]').fill('23');assert.equal(await node().locator('audio').count(),0);await page.locator('.creation-card').filter({hasText:'合成已确认执行'}).click();await page.locator('.creation-step-history audio').waitFor();assert.equal(await page.locator('.creation-step-history').getByText('本次结果记录时长：10 秒',{exact:true}).count(),1);assert.equal(state.submissionCount,1);record.checks.newDurationDoesNotRewritePastAudio=true;
 });
 await scenario('invalid-file-blocked-before-naming',async({page,state,record,configure,execute,modal})=>{
  await configure('image');const input=page.locator('.workflow-node-source input[type=file]');
  for(const file of [{name:'empty.png',mimeType:'image/png',buffer:Buffer.alloc(0)},{name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')},{name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)}]){await input.setInputFiles(file);assert(await execute().isDisabled());assert.equal(await modal().count(),0);}
  await input.setInputFiles({name:'valid.png',mimeType:'image/png',buffer:png});assert(await execute().isEnabled());assert.equal(state.workflowWrites,0);assert.equal(state.uploadCount||0,0);record.checks.emptyMimeAndSizeRejectedBeforeWrites=true;
 });
 await scenario('owned-upload-deferred-until-confirm-and-history-persists',async({page,state,record,configure,prompt,modal,run,node,audioReady})=>{
  await configure();const slider=page.locator('input[type=range]');assert.equal(await slider.getAttribute('min'),'3');assert.equal(await slider.getAttribute('max'),'30');await slider.fill('3');
  const file={name:'synthetic.png',mimeType:'image/png',buffer:png};await page.locator('.workflow-painting-input input[type=file]').setInputFiles(file);const preview=page.getByAltText('待使用的本地国画预览');await preview.waitFor();const before=await preview.getAttribute('src');
  await prompt();await modal().getByRole('button',{name:'取消',exact:true}).click();assert.equal(state.uploadCount||0,0);assert.equal(state.workflowWrites,0);assert.equal(await preview.getAttribute('src'),before);
  await run('上传国画配乐');await audioReady();assert.deepEqual(state.lastSubmitted.source,{modality:'PAINTING',assetId:id(60)});assert.equal(state.uploadCount,1);assert.equal(await node().locator('audio').evaluate(a=>a.duration),3);assert.equal(await preview.getAttribute('src'),before);
  await page.reload();await page.locator('.creation-card').filter({hasText:'上传国画配乐'}).click();await audioReady(page.locator('.creation-step-history audio'));assert.equal(state.submissionCount,1);assert.equal(state.uploadCount,1);record.checks={deferredUpload:true,filePreserved:true,ownedAssetIdentity:true,refreshNoResubmit:true};
 });
 await scenario('source-replacement-clears-result-and-identities',async({page,state,record,configure,choose,run,node,audioReady})=>{
  await configure();await choose();await run();await audioReady();await page.getByRole('button',{name:'更换国画',exact:true}).click();assert.equal(await node().locator('audio').count(),0);
  await page.locator('.workflow-painting-input input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await run('第二次上传');await audioReady();assert.deepEqual(state.lastSubmitted.source,{modality:'PAINTING',assetId:id(60)});
  await configure();await choose(91);await run('第三次画廊');await audioReady();assert.deepEqual(state.lastSubmitted.source,{modality:'PAINTING',paintingId:id(91)});assert.equal(state.uploadCount,1);assert.equal(state.submissionCount,3);record.checks.noMixedSourceIdentities=true;
 });
 for(const rejected of [{status:422,code:'CREATION_SOURCE_INVALID'},{status:503,code:'CREATION_QUEUE_FULL'}])await scenario(`definitive-${rejected.status}-rejection-allows-deliberate-retry`,async({page,state,record,configure,choose,run,execute})=>{
  await configure();await choose();await run();await page.getByText('合成请求明确拒绝',{exact:true}).waitFor();await until(()=>execute().isEnabled(),'Known rejection should permit deliberate retry');assert.equal(state.submissionCount,1);assert.equal(await page.getByText(/本登录会话已暂停新的创作提交/).count(),0);record.checks={knownRejection:true,noAutomaticRetry:true};
 },{rejectSubmit:rejected});
 await scenario('definitive-save-rejection-preserves-input-and-no-creation',async({page,state,record,configure,run,execute})=>{
  await configure('text');await page.getByLabel('画面描述').fill('修正前后均保留');await run('可修正的名字');await page.getByText('合成流程明确拒绝',{exact:true}).waitFor();assert(await execute().isEnabled());assert.equal(await page.getByLabel('画面描述').inputValue(),'修正前后均保留');assert.equal(state.workflowWrites,1);assert.equal(state.submissionCount,0);state.rejectSave=false;await run('修正后');await until(()=>state.submissionCount===1,'Explicit retry after definitive rejection');record.checks.validationFailureDoesNotBecomeUnknown=true;
 },{rejectSave:true});
 await scenario('unknown-save-recovery-only-explicit-and-preserves-input',async({page,state,record,configure,run,execute})=>{
  await configure('text');await page.getByLabel('画面描述').fill('保存响应丢失仍保留');await run('待核对本轮');await until(()=>state.workflowWrites===1,'Save received');await page.getByText(/流程准备结果未确认/).first().waitFor();assert(await execute().isDisabled());assert.equal(state.submissionCount,0);
  await page.getByRole('button',{name:'读取待核对流程',exact:true}).click();await page.getByText('待核对本轮',{exact:true}).waitFor();assert(await execute().isDisabled(),'A list read is not an ACK');assert.equal(state.workflowWrites,1);
  const row=page.locator('li').filter({hasText:'待核对本轮'});await row.getByRole('button',{name:/使用此流程继续/}).click();await until(()=>execute().isEnabled(),'Explicit recovery permits a later execution');assert.equal(await page.getByLabel('画面描述').inputValue(),'保存响应丢失仍保留');assert.equal(state.submissionCount,0);
  state.loseSaveAcknowledgement=false;await run('核对后执行');await until(()=>state.submissionCount===1,'Explicit confirmation after recovery');assert.equal(state.workflowWrites,2);record.checks={unknownNotRetried:true,listDoesNotAcknowledge:true,explicitRecoveryPreservesInput:true};
 },{loseSaveAcknowledgement:true});
 await scenario('uncertain-submit-survives-clear-and-spa-remount',async({page,state,record,configure,run,execute,clear})=>{
  await configure('text');await page.getByLabel('画面描述').fill('提交响应丢失');await run();await page.getByText(/创作提交结果暂时无法确认/).first().waitFor();assert(await execute().isDisabled());
  await page.getByLabel('画面描述').fill('修改不能解除保护');assert(await execute().isDisabled());await clear();await configure('text');await page.getByLabel('画面描述').fill('清空不能解除保护');assert(await execute().isDisabled());
  await execute().evaluate(e=>{e.click();e.dispatchEvent(new MouseEvent('click',{bubbles:true}));});assert.equal(state.submissionCount,1);await page.locator('#primary-navigation').getByRole('link',{name:'关于',exact:true}).click();await page.locator('.workflow-designer').waitFor({state:'detached'});await page.locator('#primary-navigation').getByRole('link',{name:'工坊',exact:true}).click();await page.locator('.workflow-designer').waitFor();await configure('text');await page.getByLabel('画面描述').fill('重新进入仍受保护');assert(await execute().isDisabled());assert.equal(state.submissionCount,1);record.checks.sessionGateSurvivesEditorAndRemount=true;
 },{failSubmit:true});
 await scenario('ack-before-poll-cannot-duplicate',async({page,state,record,configure,choose,run,execute,audioReady})=>{
  await configure();await choose();await run();await until(()=>state.submissionCount===1,'Submission received');assert.equal(state.detailReads,0);assert(await execute().isDisabled());await execute().evaluate(e=>e.click());assert.equal(state.submissionCount,1);await audioReady();assert(await execute().isEnabled());record.checks.ackAwaitingObservationKeepsButtonClosed=true;
 });
 for(const reverse of [false,true])await scenario(reverse?'late-history-cannot-regress-terminal':'late-poll-cannot-regress-terminal',async({page,state,record,configure,choose,run,node,execute,audioReady})=>{
  await configure();await choose();state.detailDelays=[reverse?2200:1300,0];await run();const view=page.getByRole('button',{name:'在历史区查看本次执行',exact:true});if(reverse)await view.click();await until(()=>state.detailReads>=1,'Old RUNNING read started');state.creations[0].status='SUCCEEDED';state.creations[0].steps[0].status='SUCCEEDED';if(!reverse)await view.click();await audioReady();await sleep(1450);assert.equal(await node().locator('audio').count(),1);assert(await execute().isEnabled());assert.equal(await page.locator('.creation-detail > header .creation-status').innerText(),'已完成');assert.equal(state.submissionCount,1);record.checks.terminalObservationDoesNotRegress=true;
 },{running:true,ignoreAbort:true});
 await scenario('unknown-run-status-unlocks-only-with-new-input',async({page,state,record,configure,choose,run,execute})=>{
  await configure();await choose();await run();await until(()=>state.detailReads>=1,'Unknown run observed');assert(await execute().isDisabled());await page.locator('input[type=range]').fill('11');assert(await execute().isEnabled());assert.equal(state.submissionCount,1);record.checks.unknownStatusIsNotTerminal=true;
 },{unknownStatus:true});
 await scenario('mismatched-step-does-not-render-in-current-editor',async({page,state,record,configure,choose,run,node})=>{
  await configure();await choose();await run();await until(()=>state.detailReads>=1,'Detail read');await sleep(200);assert.equal(await node().locator('img,audio').count(),0);assert.equal(await page.locator('input[type=range]').count(),1);record.checks.modalityAndOperationMustMatch=true;
 },{mismatchedStep:true});
 await scenario('late-history-and-poll-after-clear-are-rejected',async({page,state,record,configure,choose,run,clear,node})=>{
  await configure();state.delayHistory=600;await page.locator('.creation-card').filter({hasText:'合成历史11'}).click();await clear();await sleep(750);assert.equal(await page.locator('#creation-detail-title').count(),0);
  await configure();await choose();await run();await until(()=>state.detailReads>=2,'Current poll began');await clear();await sleep(750);assert.equal(await node().count(),0);assert.equal(state.submissionCount,1);record.checks.delayedReadsCannotRestoreClearedContext=true;
 },{ignoreAbort:true});
 await scenario('late-save-after-logout-does-not-submit',async({page,state,record,configure,run,logout})=>{
  await configure('text');await page.getByLabel('画面描述').fill('延迟保存');await run();await until(()=>state.workflowWrites===1,'Save actually received');await logout();await sleep(850);assert.equal(await page.locator('.workflow-designer').count(),0);assert.equal(state.submissionCount,0);record.checks.logoutRejectsLateSave=true;
 },{delaySave:600,ignoreAbort:true});
 await scenario('late-gallery-cannot-replace-new-context',async({page,state,record,configure,clear})=>{
  await configure();state.delayGallery=600;await page.getByRole('button',{name:'从画廊选择',exact:true}).click();await until(()=>state.requests.some(r=>r.path==='/api/v1/paintings'),'Gallery read began');await clear();await configure();state.delayGallery=0;state.galleryPrefix='新候选';await page.getByRole('button',{name:'从画廊选择',exact:true}).click();await page.locator('.gallery-picker-results').getByRole('button',{name:/新候选90/}).waitFor();await sleep(800);assert.equal(await page.locator('.gallery-picker-results').getByRole('button',{name:/合成国画90/}).count(),0);record.checks.oldGalleryCannotReplaceNewCandidates=true;
 },{ignoreAbort:true});
 await scenario('history-failure-is-not-empty',async({page,record})=>{await page.getByText('合成作品列表故障',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'还没有作品'}).count(),0);record.checks.failedNotEmpty=true;},{listFailure:true});
 await scenario('history-loading-is-not-empty',async({page,record})=>{assert.equal(await page.getByRole('heading',{name:'还没有作品'}).count(),0);record.checks.pendingNotEmpty=true;},{delayList:3000,pendingLoad:true});
 await scenario('confirmed-empty-history-shows-empty',async({page,record})=>{await page.getByRole('heading',{name:'还没有作品'}).waitFor();record.checks.confirmedEmpty=true;},{creations:[]});
 await scenario('audio-error-keeps-history-and-correct-label',async({page,record,history})=>{await history(12);await until(async()=>/音频.*(不可用|无法)|音乐.*(不可用|无法)/.test(await page.locator('.creation-step-history').innerText()),'Audio-specific unavailable message');assert(!/图片暂不可用/.test(await page.locator('.creation-step-history').innerText()));record.checks.audioSpecificFailure=true;},{mediaStatus:404});
 await scenario('logout-rejects-late-private-media',async({page,state,record,history,logout})=>{state.delayMedia=600;await history(12);await until(()=>state.requests.some(r=>r.path.includes(id(51))),'Audio read began');await logout();await sleep(850);assert.equal(await page.locator('audio,.creation-media-preview,#creation-detail-title').count(),0);record.checks.noLatePrivateMedia=true;},{ignoreAbort:true});
 await scenario('late-audio-cannot-overwrite-other-history',async({page,state,record,history})=>{state.delayMedia=600;await history(12);await until(()=>state.requests.some(r=>r.path.includes(id(51))),'Audio read began');await history(11);await sleep(850);assert.equal(await page.locator('.creation-step-history audio').count(),0);assert.equal(await page.locator('.creation-step-history img').count(),1);record.checks.historySelectionIsolated=true;},{ignoreAbort:true});
 await scenario('invalid-wav-has-audio-error',async({page,record,history})=>{await history(12);await page.locator('.creation-step-history').getByText('此音频暂时无法播放；作品记录已保留。',{exact:true}).waitFor();assert.equal(await page.locator('.creation-step-history audio').count(),0);record.checks.decodeFailureClassified=true;},{invalidAudio:true});
 await scenario('old-core-upload-capability-remains-closed',async({page,record,configure,execute})=>{await configure();await page.locator('.workflow-painting-input input[type=file]').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await page.getByText('当前音乐服务尚不支持上传国画，请从画廊选择。',{exact:true}).waitFor();assert(await execute().isDisabled());record.checks.oldCoreFailsClosed=true;},{legacyMusic:true});
 await scenario('capability-failure-remains-explicit',async({page,record})=>{await page.getByRole('heading',{name:'创作能力暂时无法确认'}).waitFor();record.checks.capabilityFailure=true;},{capStatus:503});
}finally{await browser.close();result.finishedAt=new Date().toISOString();result.summary={passed:result.cases.filter(c=>c.status==='PASS').length,failed:result.cases.filter(c=>c.status!=='PASS').length};result.syntheticMedia={pngSha256:createHash('sha256').update(png).digest('hex'),wavSha256:createHash('sha256').update(wavFor()).digest('hex')};await writeFile(`${output}/BROWSER_RESULT.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result.summary));if(result.summary.failed||result.blocked.length)process.exitCode=1;}
