// Real production-built React + synthetic HTTP. Never opens production or calls providers.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {newState,responseFor,id} from './fixtures/loading-runtime.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=k=>{const u=new URL(process.env[k]);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');return u.origin;};
const web=origin('LOADING_WEB_URL'),api=origin('LOADING_API_URL'),out=process.env.LOADING_BROWSER_OUTPUT;assert(out);await mkdir(out,{recursive:true});
const buildId=(await readFile(new URL('../.next/BUILD_ID',import.meta.url),'utf8')).trim();assert.equal((await fetch(`${web}/_next/static/${buildId}/_buildManifest.js`)).status,200);
const browser=await chromium.launch({headless:true});const report={buildId,browser:browser.version(),boundary:'Isolated synthetic read-only API; no production I/O or paid requests. Delays are controlled fixtures, not network performance measurements.',cases:[],errors:[],blocked:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function scenario(name,fn,options={}) {
 if(process.env.LOADING_CASES&&!process.env.LOADING_CASES.split(',').includes(name))return;
 const state=newState(options),record={name};report.cases.push(record);
 const context=await browser.newContext({viewport:{width:options.mobile?390:1440,height:options.mobile?844:1000},reducedMotion:options.motion?'no-preference':'reduce',serviceWorkers:'block'});
 await context.addInitScript(web=>{if(location.origin===web)localStorage.setItem('artlive.session.token.v1','ISOLATED_A');},web);
 if(options.ignoreAbort)await context.addInitScript(()=>{const real=window.fetch;window.fetch=(u,o)=>real(u,o?{...o,signal:undefined}:o);});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();
  if(u.origin===api){
   const headers={'access-control-allow-origin':web,'access-control-allow-methods':'GET,HEAD,OPTIONS','access-control-allow-headers':'authorization,content-type','cache-control':'no-store'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers});
   const account=req.headers().authorization?.endsWith('_B')?'B':'A';
   const response=responseFor(state,method,u,null,account);
   const delay=typeof state.delay==='function'?state.delay(u,account):state.delays[u.pathname]??0;
   if(delay)await sleep(delay);
   try {await route.fulfill({status:response.status,contentType:response.contentType,headers,body:Buffer.isBuffer(response.body)||typeof response.body==='string'?response.body:JSON.stringify(response.body)});}catch{} return;
  }
  if(u.origin===web&&method==='GET')return route.continue();
  if(u.hostname==='res.wx.qq.com')return route.fulfill({contentType:'application/javascript',body:'/* inert isolated shell */'});
  report.blocked.push({name,path:u.pathname,host:u.hostname});await route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push({name,message:e.message}));
 const shot=async suffix=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:`${out}/${name}-${suffix}.png`,fullPage:false});};
 const noOverflow=async()=>{const size=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert(size.s<=size.w+1,JSON.stringify(size));};
 const go=async route=>page.goto(web+route,{waitUntil:'domcontentloaded'});
 try{await fn({page,state,record,context,shot,noOverflow,go});assert.equal(state.writes.length,0,'Read tests never submit business/model actions');assert.deepEqual(state.unknown,[],'Every fixture read must have an explicit handler');assert.equal(report.errors.filter(e=>e.name===name).length,0);record.status='PASS';}
 catch(e){record.status='FAIL';record.error=String(e.stack);await shot('failure').catch(()=>{});}
 finally{record.requests=state.requests;record.unknown=state.unknown;await context.close();await writeFile(`${out}/BROWSER_RESULT.json`,JSON.stringify(report,null,2));console.log(`${record.status} ${name}${record.error?' '+record.error.split('\n')[0]:''}`);}
}
try {
 for(const mobile of [false,true])for(const route of ['gallery','knowledge','studio','assistant','me'])await scenario(`${mobile?'mobile':'desktop'}-${route}`,async({page,state,record,go,shot,noOverflow})=>{
  state.delays={'/api/user/profile':400,'/api/v1/paintings':1900,'/api/v1/paintings/daily':1100,'/api/v1/knowledge/painting-statistics':1800,'/api/v1/workflow/node-types':1700,'/api/v1/me/workflows':2600,'/api/v1/me/creations':2100,'/api/v1/assistant/status':1300,'/api/v1/me/favorites/paintings':1800};
  await go('/'+route+(route==='assistant'?`?session=${id(1)}`:''));await page.locator('.paper-skeleton:visible').first().waitFor();await noOverflow();await shot('loading');
  record.loadingGeometry=await page.evaluate(()=>Object.fromEntries(['.page-header','.gallery-filters','.daily-media','.knowledge-tabs'].flatMap(selector=>{const el=[...document.querySelectorAll(selector)].find(node=>node.getBoundingClientRect().height>0);if(!el)return [];const b=el.getBoundingClientRect();return [[selector,{x:b.x,y:b.y,width:b.width,height:b.height}]];})));
  assert(mobile ? await page.getByRole('button',{name:'打开导航'}).isVisible() : await page.getByRole('navigation',{name:'主导航'}).isVisible());
  if(route==='studio')assert(await page.getByRole('button',{name:'执行全流程',exact:true}).isDisabled());
  if(route==='assistant')assert(await page.getByRole('button',{name:'发送',exact:true}).isDisabled());
  const selectors={gallery:'.painting-grid .painting-card h3',knowledge:'.knowledge-count strong',studio:'.creation-card h3',assistant:'[data-testid="assistant-message"]',me:'.profile-facts dd'};
  await page.locator(selectors[route]).first().waitFor();await sleep(2300);await noOverflow();await shot('ready');
  record.readyGeometry=await page.evaluate(()=>Object.fromEntries(['.page-header','.gallery-filters','.daily-media','.knowledge-tabs'].flatMap(selector=>{const el=[...document.querySelectorAll(selector)].find(node=>node.getBoundingClientRect().height>0);if(!el)return [];const b=el.getBoundingClientRect();return [[selector,{x:b.x,y:b.y,width:b.width,height:b.height}]];})));
  if(route==='gallery')assert(Math.abs(record.loadingGeometry['.daily-media'].height-record.readyGeometry['.daily-media'].height)<=1,'Image container remains stable');
  assert.equal(await page.locator('.paper-skeleton').count(),0,'No remaining decorative placeholders after ready');
  if(route==='knowledge')assert(await page.locator('.knowledge-chart canvas').count()>0);
  record.profileReads=state.requests.filter(r=>r.path==='/api/user/profile').length;assert.equal(record.profileReads,1);
  record.reducedMotion=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);assert(record.reducedMotion);
 },{mobile});
 await scenario('gallery-independent-query-race',async({page,state,go,shot,noOverflow})=>{
  state.delays['/api/v1/paintings/daily']=1700;await go('/gallery');await page.locator('.painting-card h3').first().waitFor();assert(await page.getByRole('status').filter({hasText:'正在选择今日画作'}).isVisible());await shot('partial');
  state.delay=u=>u.searchParams.get('keyword')==='旧查询'?1600:u.searchParams.get('keyword')==='新查询'?500:0;
  const input=page.getByRole('searchbox',{name:'关键词',exact:true});await input.fill('旧查询');await page.getByRole('button',{name:'检索画作'}).click();await input.fill('新查询');await page.getByRole('button',{name:'检索画作'}).click();
  assert.equal(await page.locator('.painting-card h3').count(),0,'Old query hidden immediately');await page.getByRole('heading',{name:'新查询 1',exact:true}).waitFor();await sleep(1800);assert.equal(await page.getByRole('heading',{name:/旧查询/}).count(),0);assert.equal(await input.inputValue(),'新查询');
  state.delays['/api/v1/paintings']=900;state.delay=null;await page.getByRole('button',{name:'下一页',exact:true}).click();assert(await page.getByRole('navigation',{name:'画作分页'}).isVisible());await page.getByRole('heading',{name:'新查询 13',exact:true}).waitFor();await noOverflow();await shot('pagination');
 },{ignoreAbort:true});
 await scenario('profile-independent-failure-retry-account',async({page,state,go,shot})=>{
  state.fail['/api/v1/me/favorites/paintings']=503;await go('/me');await page.getByText('A@example.invalid',{exact:true}).waitFor();await page.getByRole('heading',{name:'收藏读取失败'}).waitFor();assert.equal(await page.getByText('还没有收藏作品',{exact:true}).count(),0);await shot('partial-error');
  delete state.fail['/api/v1/me/favorites/paintings'];await page.getByRole('button',{name:'重新读取收藏'}).click();await page.getByRole('heading',{name:'A 收藏 1',exact:true}).waitFor();await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByRole('heading',{name:'A 收藏 13',exact:true}).waitFor();assert.equal(state.requests.filter(r=>r.path==='/api/user/profile').length,1,'Favorites paging does not reread verified profile');
  state.delay=(u,account)=>u.pathname.includes('/favorites/')&&account==='A'?1500:0;
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await page.evaluate(()=>{localStorage.setItem('artlive.session.token.v1','ISOLATED_B');dispatchEvent(new StorageEvent('storage',{key:'artlive.session.token.v1'}));});
  await page.getByText('B@example.invalid',{exact:true}).waitFor();await page.getByRole('heading',{name:'B 收藏 1',exact:true}).waitFor();await sleep(1700);assert.equal(await page.getByRole('heading',{name:/A 收藏/}).count(),0);await shot('account-b');
 },{ignoreAbort:true});
 await scenario('studio-list-failure-keeps-editor-and-results',async({page,state,go,shot})=>{
  state.fail['/api/v1/me/workflows']=503;await go('/studio');await page.locator('.creation-card h3').first().waitFor();await page.getByRole('button',{name:/^文字节点/}).click();await page.getByLabel('画面描述').fill('未提交的工坊草稿');await page.getByRole('button',{name:'打开流程',exact:true}).click();await page.getByText(/流程列表刷新失败/).waitFor();assert.equal(await page.getByText('还没有保存的流程。',{exact:true}).count(),0);assert.equal(await page.getByLabel('画面描述').inputValue(),'未提交的工坊草稿');await shot('partial-failure');
  delete state.fail['/api/v1/me/workflows'];await page.getByRole('button',{name:'重新读取流程列表'}).click();await page.locator('.workflow-small-panel li').first().waitFor();assert.equal(await page.getByLabel('画面描述').inputValue(),'未提交的工坊草稿');
 });
 await scenario('knowledge-tab-revisit-error-and-keyboard',async({page,state,go,shot})=>{
  await go('/knowledge');await page.locator('.knowledge-count strong').first().waitFor();state.fail['/api/v1/knowledge/poetry-graph']=503;
  await page.getByRole('tab',{name:'国画统计'}).focus();await page.keyboard.press('End');await page.getByRole('button',{name:'重新加载'}).waitFor();await shot('graph-error');
  delete state.fail['/api/v1/knowledge/poetry-graph'];await page.getByRole('button',{name:'重新加载'}).click();await page.locator('.knowledge-graph canvas').waitFor();await page.getByRole('tab',{name:'诗词图谱'}).focus();await page.keyboard.press('Home');await page.getByRole('tab',{name:'国画统计'}).focus();await page.keyboard.press('End');assert.equal(state.requests.filter(r=>r.path==='/api/v1/knowledge/painting-statistics').length,1);assert.equal(state.requests.filter(r=>r.path==='/api/v1/knowledge/poetry-graph').length,2);await shot('graph-ready');
 });
 await scenario('assistant-refresh-draft-scroll-drawers',async({page,state,go,shot})=>{
  state.assistant.messageDelay=0;await go(`/assistant?session=${id(1)}`);await page.getByTestId('assistant-message').first().waitFor();
  const input=page.getByRole('textbox',{name:'消息',exact:true});await input.fill('保留草稿\n第二行');await page.getByRole('region',{name:'对话历史'}).evaluate(el=>el.scrollTop=55);const scrollBefore=await page.getByRole('region',{name:'对话历史'}).evaluate(el=>el.scrollTop);
  await page.getByRole('button',{name:'会话与分支',exact:true}).click();state.assistant.messageDelay=1000;await page.getByRole('button',{name:'刷新会话',exact:true}).click();await page.keyboard.press('Escape');assert(await page.getByTestId('assistant-message').count()>0);assert.equal(await input.inputValue(),'保留草稿\n第二行');await sleep(1400);assert.equal(await input.inputValue(),'保留草稿\n第二行');assert(Math.abs(await page.getByRole('region',{name:'对话历史'}).evaluate(el=>el.scrollTop)-scrollBefore)<=2,'Refresh preserves history scroll');
  await page.getByRole('button',{name:'☷ 会话纪要',exact:true}).click();state.delays['/api/v1/assistant/sessions/'+id(1)+'/summaries/page']=0;await page.getByRole('heading',{name:'当前创作方向'}).waitFor();await shot('summary');await page.keyboard.press('Escape');assert(await page.getByRole('button',{name:'☷ 会话纪要'}).evaluate(el=>el===document.activeElement));
  await page.getByRole('button',{name:'↳ 输入历史'}).click();await page.getByRole('button',{name:'加载更早输入记录'}).click();await page.getByRole('dialog',{name:'输入历史'}).getByText('更早的真实用户输入（隔离记录）',{exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'会话与分支',exact:true}).click();await page.getByRole('button',{name:'刷新会话',exact:true}).click();await page.keyboard.press('Escape');await sleep(1400);assert.equal(await page.getByTestId('assistant-message').count(),6,'Paged older messages retained on refresh');await shot('retained-history');
 });
 await scenario('assistant-capability-read-failure-never-authorizes',async({page,state,go,shot})=>{
  state.fail['/api/v1/assistant/models']=503;await go(`/assistant?session=${id(1)}`);await page.getByTestId('assistant-message').first().waitFor();const input=page.getByRole('textbox',{name:'消息',exact:true});await input.fill('能力核实前保留的草稿');assert(await page.getByRole('button',{name:'发送消息',exact:true}).isDisabled());await shot('model-unverified');
  delete state.fail['/api/v1/assistant/models'];state.delays['/api/v1/assistant/models']=1200;await page.getByRole('button',{name:'重新核对能力',exact:true}).click();assert(await page.getByRole('button',{name:'发送消息',exact:true}).isDisabled());await sleep(1600);assert.equal(await input.inputValue(),'能力核实前保留的草稿');assert(await page.getByRole('button',{name:'发送消息',exact:true}).isEnabled());await shot('verified-no-submit');
 });
 await scenario('studio-permission-failure-clears-retained-records',async({page,state,go,shot})=>{
  await go('/studio');await page.locator('.creation-card h3').first().waitFor();state.fail['/api/v1/me/creations']=403;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('隔离读取失败',{exact:true}).waitFor();assert.equal(await page.locator('.creation-card h3').count(),0);await shot('forbidden');
 });
 await scenario('assistant-storage-permission-clears-retained-usage',async({page,state,go,shot})=>{
  await go(`/assistant?session=${id(1)}`);await page.getByRole('button',{name:'更多工具与恢复'}).click();const storage=page.getByTestId('assistant-storage');await storage.getByText(/已占配额/).waitFor();state.fail['/api/v1/assistant/storage']=403;await storage.getByRole('button',{name:'刷新用量'}).click();await storage.getByText('图片用量访问未获确认，已清除旧用量。请重新读取。',{exact:true}).waitFor();assert.equal(await storage.getByText(/已占配额/).count(),0);await shot('forbidden-usage');
 });
 await scenario('auth-slow-retry-expiry-motion',async({page,state,go,shot})=>{
  state.delays['/api/user/profile']=11000;await go('/me');await page.getByRole('status').filter({hasText:'正在确认个人资料'}).waitFor();assert.equal(state.requests.filter(r=>r.path.includes('/favorites')).length,0);await sleep(10100);await shot('slow-auth');
  await page.getByText('A@example.invalid',{exact:true}).waitFor();state.fail['/api/v1/me/favorites/paintings']=401;await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForURL('**/login?**');assert.equal(await page.getByText('A@example.invalid',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('artlive.session.token.v1')),null);
 },{motion:true});
 await scenario('detail-and-image-loading',async({page,state,go,shot,noOverflow})=>{
  state.delays['/api/v1/paintings/'+id(90)]=1400;state.delays['/api/v1/assets/'+id(1090)+'/content']=1500;await go('/gallery/'+id(90));await page.getByRole('status').filter({hasText:'正在展开作品详情'}).waitFor();await shot('detail-skeleton');await page.getByRole('heading',{name:'隔离详情山水',exact:true}).waitFor();await noOverflow();await shot('image-pending');await sleep(2000);assert(await page.locator('.detail-media img').evaluate(el=>el.complete&&el.naturalWidth>0));await shot('image-ready');
 },{mobile:true});
 await scenario('rapid-route-navigation',async({page,state,go,noOverflow,shot})=>{
  state.delays['/api/v1/paintings']=2000;await go('/gallery');await page.getByRole('status').filter({hasText:'正在读取画作目录'}).waitFor();await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'知识库'}).click();await page.locator('.knowledge-count strong').first().waitFor();await sleep(2300);assert.equal(await page.locator('.painting-card').count(),0);await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'画廊',exact:true}).click();await page.locator('.painting-card h3').first().waitFor();await noOverflow();await shot('revisit');
 },{ignoreAbort:true});
}finally{await browser.close();await writeFile(`${out}/BROWSER_RESULT.json`,JSON.stringify(report,null,2));}
if(report.cases.some(c=>c.status!=='PASS')||report.blocked.length)process.exitCode=1;
