// Isolated assistant contract fixture. No credentials, database, provider or production I/O.
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const at = '2026-10-25T06:30:00Z';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2f9sAAAAASUVORK5CYII=', 'base64');
const pageOf=(items,nextCursor=null)=>({items,nextCursor,hasMore:!!nextCursor});
export const prose=`## 一、画面如何舒展\n\n可以先从**远近层次与留白**入手，让视线沿着山势缓缓展开。国画中的虚实，不只是画与不画，也是疏密、浓淡和节奏的关系。\n\n> 先安排气息，再推敲细节。空白也是构图的一部分。\n\n### 从笔墨到设色\n\n- **近景**：树石稳住画面，注意墨色的浓淡变化。\n- **中景**：以水面和云气连接，保留可游、可居的空间。\n- **远景**：淡墨轻染，留给观看者想象。\n\n这是一段隔离测试资料。正文编号 [42] 不是经过核验的来源。\n\n| 观察角度 | 尝试方向 |\n| --- | --- |\n| 疏密 | 留出呼吸的空间 |\n| 色调 | 赭石与花青相互衬托 |`;
export const model=(id,label,images=true,enabled=true)=>({id,label,providerId:'fixture-provider',modelId:id,enabled,configured:true,capabilities:{images,streaming:true,imageMimeTypes:images?['image/png','image/jpeg']:[]},evidence:'隔离注册表声明，不代表生产模型验收'});
export const message=(n,role,body,runId=null)=>({id:id(n),sessionId:id(1),parentMessageId:null,versionGroupId:id(n),supersedesId:null,role,body,state:'ACCEPTED',runId,createdAt:at,attachmentIds:[]});
export const run=(n,branchId=id(2),status='COMPLETED')=>({id:id(n),sessionId:id(1),branchId,kind:'CHAT',status,inputMessageId:id(n-100),modelKey:'fixture-vision',sequence:0,checkpoint:'',retryOf:null,attempt:1,executionUncertain:false,retrieval:{artworks:'AVAILABLE',ragflow:'DISABLED',web:'AVAILABLE'},usage:{},errorCode:null,createdAt:at,updatedAt:at});
export function newState(options={}) {
 const first=[message(10,'USER','我想画一幅雨后山水，怎样安排远近与留白？'),message(11,'ASSISTANT',prose,id(110)),message(12,'USER','怎样让山水中的设色更含蓄？'),message(13,'ASSISTANT','### 让色彩成为墨的回声\n\n先以淡赭石打底，再用**花青**轻染远山。\n\n> 颜色宜淡，层次宜清。\n\n用几处温暖的色点，回应画面里的冷色。',id(112))];
 const session={id:id(1),title:'雨后山水的构图与设色',activeBranchId:id(2),version:1,summaryAutoEnabled:false,status:'ACTIVE',createdAt:at,updatedAt:at};
 const branch={id:id(2),sessionId:id(1),parentBranchId:null,forkMessageId:null,headMessageId:id(13),version:1,createdAt:at};
 const attachment={id:id(80),sessionId:id(1),filename:'隔离山水草稿.png',mimeType:'image/png',byteSize:png.length,sha256:'0'.repeat(64),width:1,height:1,status:'READY',contentUrl:`/api/v1/assistant/attachments/${id(80)}/content`,draftExpiresAt:'2026-12-01T00:00:00Z'};
 const state={session,branches:[branch,{...branch,id:id(3),parentBranchId:id(2),headMessageId:id(21)}],messages:{[id(2)]:first,[id(3)]:[message(20,'USER','历史分支中的梅花问题'),message(21,'ASSISTANT','这是保留的历史分支回复。',id(120))]},runs:[run(110),run(112),run(120,id(3))],attachments:[],attachment,requests:[],writes:[],unknown:[],summaryReads:0,sourceReads:[],...options};
 if(options.long)state.messages[id(2)]=Array.from({length:60},(_,i)=>message(200+i,i%2?'ASSISTANT':'USER',i%2?prose:`长对话第 ${i/2+1} 个问题`));
 if(options.security)state.messages[id(2)].push(message(40,'ASSISTANT','<script>window.markdownExecuted=true</script>\n\n![不可信图片](https://never-fetch.invalid/secret.png)\n\n[危险链接](javascript:alert(1))\n\n[外链](https://example.invalid/)\n\n由于本轮对话中未启用且未配置任何检索工具（reference_data 显示 artworks 和 ragflow 均为 DISABLED），回答仅基于我内部的一般知识储备。\n\n### 安全标题\n\n正文引用 [999] 尚未核验。\n\n[{"id":"versions","title":"想了解哪个版本？","options":[{"id":"song","label":"北宋"}]}]'));
 if(options.draft)state.attachments=[attachment];
 if(options.active){const active=run(150,id(2),'EXECUTING');state.runs.push(active);}
 return state;
}
export function responseFor(s,method,u,body) {
 const p=u.pathname, q=u.searchParams;
 s.requests.push({method,path:p,query:u.search,body});if(method!=='GET')s.writes.push({method,path:p,body});
 const json=(body,status=200,delayMs=0)=>({status,body,contentType:'application/json',delayMs});
 if(p==='/api/user/profile')return json({success:true,data:{id:s.otherAccount?900002:900001,username:'isolated-assistant',fullName:s.otherAccount?'隔离账号乙':'隔离测试',email:'fixture@example.invalid',createdAt:null,updatedAt:null}});
 if(p==='/api/v1/me/favorites')return json({items:[],page:0,size:12,totalElements:0,totalPages:0,first:true,last:true,hasNext:false});
 const a='/api/v1/assistant';
 if(p===a+'/status')return s.unavailable?json({message:'隔离：助手暂不可用'},503):json({enabled:true,stage:'S2',executionAvailable:!s.historyOnly,generationAvailable:!s.suspended&&!s.historyOnly,generationState:s.suspended?'ASSISTANT_GENERATION_SUSPENDED':'AVAILABLE',automaticSummaryAvailable:true,summaryTurnThreshold:5,summaryIdleSeconds:90,maxSummaryPerHour:2});
 if(p===a+'/models')return json({models:[model('fixture-vision','视觉对话模型'),model('fixture-text','文字对话模型',false),model('fixture-off','暂不可用模型',true,false)],retrieval:{state:'NOT_CONFIGURED'},webSearch:{state:'AVAILABLE'},configSha256:'0'.repeat(64)});
 if(p===a+'/sessions/page')return json(pageOf(s.otherAccount?[]:[s.session]));
 if(p===a+'/sessions/'+id(1)) {
  if(s.otherAccount)return json({message:'不属于当前账号'},404);
  if(method==='PATCH'){Object.assign(s.session,body,{version:s.session.version+1});return json(s.session);}
  return json(s.session);
 }
 if(p.endsWith('/branches/page'))return json(pageOf(s.branches));
 if(p.includes('/branches/'))return json(s.branches.find(b=>b.id===p.split('/').at(-1)));
 if(p.endsWith('/messages/page')) {
  if(s.failMessages)return json({message:'隔离：历史读取失败'},503);
  if(q.get('cursor')) {if(s.failOlder)return json({message:'隔离：更早记录读取失败'},503);return json(pageOf([message(8,'USER','更早的真实用户输入（隔离记录）'),message(9,'ASSISTANT','更早的回复')]),200,s.messageDelay||0);}
  return json(pageOf(s.messages[q.get('branchId')]||[],s.paginate&&q.get('branchId')===id(2)?'older':null),200,s.messageDelay||0);
 }
 if(p.endsWith('/runs/page'))return json(pageOf(s.runs.filter(r=>q.get('activeOnly')==='true'?!['COMPLETED','CANCELLED','FAILED','INTERRUPTED'].includes(r.status):r.branchId===q.get('branchId'))));
 if(p.endsWith('/attachments/draft'))return json(pageOf(s.attachments));
 if(p===a+'/storage')return json({policyStatus:'VALID',uploadsAvailable:true,historyOnly:false,quotaBytes:104857600,readyBytes:png.length,reservedBytes:0,logicalBytes:png.length,cleanupReservedBytes:0,chargedBytes:png.length,retainedFileBytes:png.length,pendingCleanupBytes:0,availableBytes:104857600-png.length,draftLifetimeSeconds:86400,cleanupEnabled:false});
 if(p.endsWith('/attachments')&&method==='POST'){s.attachments=[s.attachment];return json(s.attachment);}
 if(p===a+'/attachments/'+id(80))return json(s.attachment);
 if(p===s.attachment.contentUrl)return {status:200,body:png,contentType:'image/png'};
 if(p.endsWith('/summaries/page')) {s.summaryReads++;if(s.failSummary)return json({message:'隔离：摘要读取失败'},503);return json(pageOf(s.emptySummary?[]:[{id:id(90),branch_id:q.get('branchId'),current_run_id:id(91),body:'## 当前创作方向\n\n以**雨后山水**为主题，保持画面疏朗。\n\n### 已讨论的要点\n\n- 留白连接远近。\n- 花青与赭石相互衬托。\n- 先笔墨，后设色。\n\n> 这是已经保存的摘要，不是打开面板后新生成。',status:'COMPLETED',model_id:'fixture-vision',stale:false,usage:{}}]),200,s.summaryDelay||0);}
 if(p.endsWith('/timeline/page'))return json(pageOf([]));
 if(p.endsWith('/citations')) {
  const runId=p.split('/').at(-2);s.sourceReads.push(runId);
  if(s.failSources)return json({message:'隔离：来源读取失败'},503);
  return json(runId===id(110)?[{id:id(60),ordinal:1,sourceType:'PLATFORM_ARTWORK',sourceId:id(70),sourceVersion:'3',projectionVersion:'public-v1',provenance:{artworkId:id(70),deliveryEvidence:'MODEL_STREAM_OBSERVED'},excerpt:JSON.stringify([{key:'core.title',value:'隔离山水作品',rawValue:null,valueStatus:'PRESENT',assertionStatus:'UNSPECIFIED'},{key:'core.author_name',value:'合成作者',rawValue:null,valueStatus:'PRESENT',assertionStatus:'UNSPECIFIED'}]),excerptSha256:'a'.repeat(64)},{id:id(61),ordinal:2,sourceType:'WEB_RESULT',sourceId:'fixture-web',sourceVersion:'received-content-sha256:test',projectionVersion:'brave-web-search-v1',provenance:{title:'故宫博物院：清明上河图',url:'https://www.dpm.org.cn/example',deliveryEvidence:'MODEL_STREAM_OBSERVED'},excerpt:'故宫博物院：清明上河图\n公开网页摘要\nhttps://www.dpm.org.cn/example',excerptSha256:'b'.repeat(64)}]:[]);
 }
 if(p.endsWith('/choices'))return json(s.choices?[{runId:p.split('/').at(-2),sourceMessageId:id(10),id:id(71),title:'服务端选择卡',options:[{id:'ink',label:'继续聊笔墨',text:'继续聊笔墨'}]}]:[]);
 if(p.endsWith('/events')) {
  const r=s.runs.find(r=>r.id===p.split('/').at(-2));r.sequence++;r.checkpoint='### 正在展开思路\n\n隔离流式回复，取消后保留已接收内容。';
  return {status:200,contentType:'text/event-stream',body:`id: ${r.sequence}\nevent: message.snapshot\ndata: ${JSON.stringify({contractVersion:1,sequence:r.sequence,runId:r.id,branchId:r.branchId,text:r.checkpoint,state:r.status})}\n\n`,delayMs:200};
 }
 if(p.endsWith('/cancel')) {const r=s.runs.find(r=>r.id===p.split('/').at(-2));r.status='CANCELLED';return json(r);}
 if(p.match(/\/runs\/[^/]+$/)&&method==='GET'){const r=s.runs.find(r=>r.id===p.split('/').at(-1));return json(s.badSourceIdentity?{...r,sessionId:id(999)}:r);}
 if(p.endsWith('/runs')&&method==='POST') {const r=run(150,body.branchId,'EXECUTING');s.runs.push(r);return s.uncertainSubmit?{abort:true}:json({run:r,replay:false});}
 if(p.endsWith('/requests/resolve'))return json(s.uncertainSubmit?{status:'FOUND',resultType:'RUN',resultId:id(150)}:{status:'NOT_FOUND'});
 if(p.endsWith('/artworks/page'))return json({items:[{artworkId:id(70),batchId:id(75),revision:3,projectionVersion:'public-v1',sourceRecordId:'fixture-only',fields:[{key:'core.title',value:'隔离山水作品',rawValue:null,valueStatus:'PRESENT',assertionStatus:'UNSPECIFIED'}]}],page:0,size:10,totalPages:1,totalElements:1});
 s.unknown.push({method,path:p});return json({message:'Unimplemented isolated fixture endpoint'},404);
}
