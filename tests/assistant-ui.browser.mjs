// Run only against a loopback Next preview. Every API response is isolated and synthetic.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {newState,responseFor,id,png} from './fixtures/assistant-ui-runtime.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=key=>{const u=new URL(process.env[key]);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');return u.origin;};
const web=origin('ASSISTANT_WEB_URL'),api=origin('ASSISTANT_API_URL'),out=process.env.ASSISTANT_BROWSER_OUTPUT;assert(out);await mkdir(out,{recursive:true});
const buildId=await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8').then(s=>s.trim()).catch(()=>null);
if(buildId)assert.equal((await fetch(`${web}/_next/static/${buildId}/_buildManifest.js`)).status,200,'Preview serves the built bundle');
const browser=await chromium.launch({headless:true});
const result={boundary:'Real Assistant React; loopback-only intercepted fixtures. No paid model, production write or provider call.',browser:browser.version(),buildId,cases:[],blocked:[],pageErrors:[],console:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<120;i++){if(await fn())return;await sleep(50);}throw Error(label);}
async function scenario(name,fn,options={}) {
 if(process.env.ASSISTANT_CASES&&!process.env.ASSISTANT_CASES.split(',').includes(name))return;
 const state=newState(options),record={name};result.cases.push(record);
 const context=await browser.newContext({viewport:{width:options.mobile?390:1440,height:options.height||1000},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(web=>{if(location.origin===web)localStorage.setItem('artlive.session.token.v1','ISOLATED_ASSISTANT_NOT_A_JWT');},web);
 if(options.speech)await context.addInitScript(()=>{window.SpeechRecognition=class {start(){setTimeout(()=>{this.onresult?.({results:[[{transcript:'语音转写待编辑'}]]});this.onend?.();},20);}abort(){this.onend?.();}};});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();
  if(u.origin===api){
   if(method==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':web,'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type'}});
   const response=responseFor(state,method,u,req.postData()?.startsWith('{')?req.postDataJSON():null);
   if(response.delayMs)await sleep(response.delayMs);
   try {if(response.abort)await route.abort('failed');else await route.fulfill({status:response.status,contentType:response.contentType,headers:{'access-control-allow-origin':web,'cache-control':'no-store'},body:Buffer.isBuffer(response.body)||typeof response.body==='string'?response.body:JSON.stringify(response.body)});}catch{/* Deliberate page close may cancel a fixture read. */}return;
  }
  if(u.origin===web&&method==='GET')return route.continue();
  // The shared shell's optional WeChat script is inert in this fixture, not loaded remotely.
  if(u.hostname==='res.wx.qq.com')return route.fulfill({status:200,contentType:'application/javascript',body:'/* isolated shell */'});
  result.blocked.push({case:name,method,url:req.url()});return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>result.pageErrors.push({case:name,message:e.message}));page.on('console',e=>{if(['error','warning'].includes(e.type()))result.console.push({case:name,type:e.type(),message:e.text()});});
 const shot=async suffix=>page.screenshot({path:`${out}/${name}${suffix?'-'+suffix:''}.png`,fullPage:true});
 const dialog=title=>page.getByRole('dialog',{name:title,exact:true});
 const open=async(title,label=title)=>{await page.getByRole('button',{name:label,exact:true}).click();await dialog(title).waitFor();};
 const close=async()=>{await page.keyboard.press('Escape');await until(()=>page.locator('dialog:modal').count().then(n=>n===0),'Dialog dismissed');};
 const noOverflow=async()=>{const x=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,body:document.documentElement.scrollHeight}));assert(x.scroll<=x.width,JSON.stringify(x));assert(x.body<=x.height+2,JSON.stringify(x));};
 try {
  await page.goto(web+'/assistant'+(options.noSelection?'':`?session=${id(1)}`),{waitUntil:options.active?'domcontentloaded':'networkidle'});
  if(!options.unavailable&&!options.noSelection)await page.getByRole('heading',{name:state.session.title,exact:true}).waitFor();
  await fn({page,state,record,context,shot,dialog,open,close,noOverflow});
  assert.equal(result.pageErrors.filter(e=>e.case===name).length,0,'No runtime errors');assert.equal(state.unknown.length,0,JSON.stringify(state.unknown));record.status='PASS';await shot();
 }catch(e){record.status='FAIL';record.error=String(e.stack);await shot('failure').catch(()=>{});}
 finally {record.writes=state.writes;record.requests=state.requests.map(({method,path,query})=>({method,path,query}));await context.close();await writeFile(`${out}/BROWSER_RESULT.json`,JSON.stringify(result,null,2));console.log(`${record.status} ${name}${record.error?' '+record.error.split('\n')[0]:''}`);}
}
try {
 await scenario('desktop-reference-states',async({page,state,shot,dialog,open,close,noOverflow})=>{
  await noOverflow();assert(await page.getByRole('textbox',{name:'消息',exact:true}).isVisible());
  await page.getByRole('region',{name:'对话历史'}).evaluate(el=>el.scrollTop=0);await shot('conversation');
  await open('会话纪要','☷ 会话纪要');await dialog('会话纪要').getByRole('heading',{name:'当前创作方向'}).waitFor();await shot('summary');await dialog('会话纪要').getByText('自动摘要与调用说明',{exact:true}).click();assert(!(await dialog('会话纪要').getByRole('checkbox',{name:'自动摘要'}).isChecked()));await close();assert.equal(await page.getByRole('button',{name:'☷ 会话纪要',exact:true}).evaluate(e=>e===document.activeElement),true);
  await open('输入历史','↳ 输入历史');assert.equal(await dialog('输入历史').locator('article').count(),2);assert(!await dialog('输入历史').getByText('让色彩成为墨的回声',{exact:true}).count());await shot('history');await close();
  await open('资料来源','▤ 资料来源');await dialog('资料来源').getByRole('button',{name:/一、画面如何舒展/}).click();await dialog('资料来源').getByText(/隔离山水作品/).waitFor();await shot('sources');await close();
  await page.getByRole('button',{name:'视觉对话模型',exact:true}).click();await dialog('选择模型').waitFor();assert(await dialog('选择模型').getByRole('radio').last().isDisabled());await shot('model-picker');await close();assert.equal(state.writes.length,0,'Opening panels never generates or updates preferences');
 },{paginate:true});
 await scenario('mobile-reference-states',async({page,shot,dialog,open,close,noOverflow})=>{
  await noOverflow();await shot('conversation');
  for(const [title,label] of [['会话纪要','☷ 会话纪要'],['输入历史','↳ 输入历史'],['资料来源','▤ 资料来源']]){await open(title,label);await noOverflow();await shot(title);await page.keyboard.press('Tab');assert(await dialog(title).evaluate(el=>el.contains(document.activeElement)));await close();}
  await open('我的对话','☰ 我的对话');await shot('sessions');await close();
  await page.getByRole('button',{name:'视觉对话模型'}).click();await dialog('选择模型').waitFor();await shot('model-picker');await close();
 },{mobile:true});
 await scenario('long-composer-attachments-refresh',async({page,state,shot,noOverflow})=>{
  const input=page.getByRole('textbox',{name:'消息',exact:true});await input.fill(Array(12).fill('多行输入仍可编辑').join('\n'));await input.press('Shift+Enter');assert.equal(state.writes.length,0);
  await page.getByLabel('添加图片',{exact:true}).setInputFiles({name:'隔离山水草稿.png',mimeType:'image/png',buffer:png});await page.getByTestId(`attachment-${id(80)}`).getByRole('img').first().waitFor();
  await noOverflow();await shot('expanded');const composer=await page.getByRole('form',{name:'发送消息'}).boundingBox();assert(composer.y+composer.height<=1000);
  await page.reload({waitUntil:'networkidle'});await page.getByTestId(`attachment-${id(80)}`).getByRole('img').first().waitFor();assert.equal(state.writes.length,1,'Refresh does not upload or generate again');
  await page.setViewportSize({width:390,height:540});await page.getByRole('textbox',{name:'消息',exact:true}).fill('键盘收起前\n保留编辑内容\n第三行\n第四行');await noOverflow();const b=await page.getByRole('button',{name:'发送消息',exact:true}).boundingBox();assert(b.y+b.height<=540);await shot('keyboard-height');
 },{long:true});
 await scenario('branch-pagination-and-source-association',async({page,state,dialog,open,close})=>{
  await open('输入历史','↳ 输入历史');await dialog('输入历史').getByRole('button',{name:'加载更早输入记录'}).click();await dialog('输入历史').getByText('更早的真实用户输入（隔离记录）',{exact:true}).waitFor();await close();
  await open('会话与分支');await dialog('会话与分支').getByLabel('分支',{exact:true}).selectOption(id(3));await close();await page.getByText('这是保留的历史分支回复。',{exact:true}).waitFor();
  await open('输入历史','↳ 输入历史');await dialog('输入历史').getByText('历史分支中的梅花问题',{exact:true}).waitFor();assert(!await dialog('输入历史').getByText(/雨后山水/).count());await close();
  await open('资料来源','▤ 资料来源');await dialog('资料来源').getByRole('button',{name:/保留的历史分支回复/}).click();await dialog('资料来源').getByText(/本次执行没有保存可追溯来源/).waitFor();assert.deepEqual([...new Set(state.sourceReads)],[id(120)]);assert.equal(state.writes.length,1);assert.equal(state.writes[0].method,'PATCH');
 },{paginate:true});
 await scenario('markdown-safety-and-server-choices',async({page,state})=>{
  await page.getByRole('heading',{name:'安全标题'}).waitFor();assert.equal(await page.evaluate(()=>window.markdownExecuted),undefined);assert.equal(await page.locator('a[href^="javascript:"]').count(),0);assert.equal(await page.locator('img[src^="https:"]').count(),0);assert.equal(await page.getByRole('link',{name:'999',exact:true}).count(),0);assert.equal(await page.getByTestId('choice-card').count(),2);assert.equal(state.writes.length,0);
 },{security:true,choices:true});
 await scenario('stream-cancel-refresh-recovery',async({page,state,shot})=>{
  await page.getByTestId('assistant-live').getByRole('heading',{name:'正在展开思路'}).waitFor();await shot('streaming');await page.reload({waitUntil:'domcontentloaded'});await page.getByTestId('assistant-live').waitFor();assert.equal(state.writes.length,0);
  await page.getByRole('button',{name:'取消生成',exact:true}).click();await until(()=>state.runs.at(-1).status==='CANCELLED','Cancel persisted');await page.getByTestId('assistant-live').getByText('已取消',{exact:true}).waitFor();assert.equal(state.writes.length,1);assert(state.writes[0].path.endsWith('/cancel'));
 },{active:true});
 await scenario('uncertain-submit-resolves-without-replay',async({page,state})=>{
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('隔离请求');await page.getByRole('button',{name:'发送消息',exact:true}).click();await until(()=>state.writes.some(x=>x.path.endsWith('/runs')),'one synthetic admission');await page.reload({waitUntil:'domcontentloaded'});await page.getByTestId('assistant-live').waitFor();assert.equal(state.writes.filter(x=>x.path.endsWith('/runs')).length,1);assert(state.writes.some(x=>x.path.endsWith('/requests/resolve')));
 },{uncertainSubmit:true});
 await scenario('honest-loading-empty-errors',async({page,state,dialog,open,close})=>{
  await open('会话纪要','☷ 会话纪要');await dialog('会话纪要').getByText('正在读取已保存摘要…',{exact:true}).waitFor();await dialog('会话纪要').getByText('当前分支暂无摘要。',{exact:true}).waitFor();await close();
  state.failSummary=true;await open('会话纪要','☷ 会话纪要');await dialog('会话纪要').getByRole('alert').filter({hasText:'隔离：摘要读取失败'}).waitFor();assert(!await dialog('会话纪要').getByText('当前分支暂无摘要。',{exact:true}).count());state.failSummary=false;await dialog('会话纪要').getByRole('button',{name:'重新读取',exact:true}).click();await dialog('会话纪要').getByText('当前分支暂无摘要。',{exact:true}).waitFor();await close();
  state.failSources=true;await open('资料来源','▤ 资料来源');await dialog('资料来源').getByRole('button',{name:/一、画面如何舒展/}).click();await dialog('资料来源').getByRole('alert').filter({hasText:'隔离：来源读取失败'}).waitFor();state.failSources=false;await dialog('资料来源').getByRole('button',{name:'重新读取本条来源'}).click();await dialog('资料来源').getByText(/隔离山水作品/).waitFor();assert.equal(state.writes.length,0);
 },{emptySummary:true,summaryDelay:400});
 await scenario('suspended-history-account-isolation',async({page,state,context,dialog,open,close})=>{
  assert(await page.getByRole('button',{name:'发送消息',exact:true}).isDisabled());await open('输入历史','↳ 输入历史');await close();
  state.otherAccount=true;await page.evaluate(()=>{localStorage.setItem('artlive.session.token.v1','OTHER_ISOLATED_ACCOUNT');window.dispatchEvent(new StorageEvent('storage',{key:'artlive.session.token.v1'}));});await until(()=>page.getByTestId('assistant-message').count().then(n=>n===0),'Old account history cleared');assert.equal(state.writes.length,0);assert(await context.pages().length===1);
 },{suspended:true});
 await scenario('keyboard-picker-speech-artwork-selection',async({page,state,dialog,open,close,noOverflow})=>{
  const input=page.getByRole('textbox',{name:'消息',exact:true});await input.fill('尚未发送的草稿');
  await page.getByRole('button',{name:'视觉对话模型',exact:true}).click();await page.keyboard.press('ArrowDown');assert.equal(await page.getByRole('radio').nth(1).evaluate(e=>e===document.activeElement),true);assert.equal(state.writes.length,0);await page.keyboard.press('Enter');await until(()=>page.locator('dialog:modal').count().then(n=>n===0),'Model selection dismissed');assert(await page.getByRole('button',{name:'文字对话模型',exact:true}).isVisible());assert.equal(state.writes.length,0);
  await page.getByRole('button',{name:'语音输入',exact:true}).click();await until(()=>input.inputValue().then(t=>t.includes('语音转写待编辑')),'Transcript editable');await input.fill('编辑后的转写');assert.equal(state.writes.length,0);
  await open('平台作品参考','平台作品');await dialog('平台作品参考').getByText('筛选并选用平台作品',{exact:true}).click();await dialog('平台作品参考').getByRole('button',{name:'查找作品',exact:true}).click();await dialog('平台作品参考').getByRole('button',{name:'选用此作品'}).click();await close();await page.getByRole('button',{name:'已选 1 幅平台作品 · 查看 / 调整'}).waitFor();assert.equal(await input.inputValue(),'编辑后的转写');await noOverflow();assert.equal(state.writes.length,0);
 },{mobile:true,speech:true});
 await scenario('pagination-failure-preserves-loaded-input',async({page,state,dialog,open})=>{
  await open('输入历史','↳ 输入历史');await dialog('输入历史').getByRole('button',{name:'加载更早输入记录'}).click();await dialog('输入历史').getByRole('alert').filter({hasText:'更早记录读取失败'}).waitFor();assert.equal(await dialog('输入历史').locator('article').count(),2);state.failOlder=false;await dialog('输入历史').getByRole('button',{name:'加载更早输入记录'}).click();await dialog('输入历史').getByText('更早的真实用户输入（隔离记录）',{exact:true}).waitFor();assert.equal(state.writes.length,0);
 },{paginate:true,failOlder:true});
 await scenario('source-identity-mismatch-refused',async({page,state,dialog,open})=>{
  await open('资料来源','▤ 资料来源');state.badSourceIdentity=true;await dialog('资料来源').getByRole('button',{name:/一、画面如何舒展/}).click();await dialog('资料来源').getByRole('alert').filter({hasText:'来源执行身份与这条消息不一致'}).waitFor();assert.equal(await dialog('资料来源').getByText(/隔离山水作品/).count(),0);assert.equal(state.writes.length,0);
 });
 await scenario('history-only-retains-records',async({page,state,dialog,open})=>{
  await page.getByText(/当前为历史模式：可以浏览/).waitFor();assert.equal(await page.getByRole('form',{name:'发送消息'}).count(),0);await open('输入历史','↳ 输入历史');assert.equal(await dialog('输入历史').locator('article').count(),2);assert.equal(state.writes.length,0);
 },{historyOnly:true});
 await scenario('visual-viewport-keyboard',async({page,noOverflow,shot})=>{
  const input=page.getByRole('textbox',{name:'消息',exact:true});await input.fill(Array(12).fill('展开的输入与键盘').join('\n'));
  await page.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{value:440,configurable:true});window.visualViewport.dispatchEvent(new Event('resize'));});
  await until(()=>page.locator('[style*="--assistant-height"]').evaluate(el=>el.style.getPropertyValue('--assistant-height')==='440px'),'Visual viewport resize handled');await noOverflow();
  await until(async()=>{const send=await page.getByRole('button',{name:'发送消息',exact:true}).boundingBox(),tools=await page.getByRole('button',{name:'更多工具与恢复'}).boundingBox();return send.y+send.height<=440&&tools.y+tools.height<=440;},'Send and tools fit the reduced visual viewport');await shot('keyboard');
 },{mobile:true,height:844,draft:true});
 await scenario('other-route-style-isolation',async({page})=>{
  await page.goto(web+'/about',{waitUntil:'networkidle'});await page.locator('.site-footer').waitFor();assert(await page.locator('.site-footer').isVisible());assert.equal(await page.getByRole('form',{name:'发送消息'}).count(),0);assert(await page.getByRole('navigation',{name:'主导航',exact:true}).isVisible());
 });
 await scenario('unavailable',async({page,noOverflow})=>{await page.getByRole('heading',{name:'助手暂不可用'}).waitFor();await noOverflow();},{unavailable:true,mobile:true});
 await scenario('empty-conversation',async({page,noOverflow})=>{await page.getByRole('heading',{name:'落笔之前，一起想想'}).waitFor();await noOverflow();},{noSelection:true});
}finally{await browser.close();await writeFile(`${out}/BROWSER_RESULT.json`,JSON.stringify(result,null,2));}
if(result.cases.some(x=>x.status!=='PASS')||result.blocked.length)process.exitCode=1;
