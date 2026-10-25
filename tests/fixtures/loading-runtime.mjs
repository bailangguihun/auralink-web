// Synthetic read fixtures only. Not production measurements or acceptance data.
import { newState as assistantState, responseFor as assistantResponse, id, png } from './assistant-ui-runtime.mjs';
import { newState as studioState, responseFor as studioResponse, pageOf } from './studio-runtime.mjs';
export { id };
const json = (body, status=200) => ({body, status, contentType:'application/json'});
export const painting = (n, title=`隔离画作 ${n}`) => ({paintingId:id(n),title,authorName:'合成作者',creationDynastyNormalized:'当代',category:'山水',subject:'隔离资料',artisticConception:'此内容仅用于读取与布局测试，不是真实作品记录。',imageAvailable:true,image:{assetId:id(n+1000),mimeType:'image/png',fileSize:png.length,width:800,height:600,contentUrl:`/api/v1/assets/${id(n+1000)}/content`,downloadUrl:null},favorited:true});
export const statistics = () => ({schemaVersion:1,population:{key:'gallery-displayable',label:'可浏览画作',count:3},authorNames:{count:1,eligibleRecords:2},metrics:Object.fromEntries(['geography','dynasty','category','style','imagery','sentiment','sentimentByDynasty'].map(name=>[name,{status:'available',reason:null,eligibleRecords:2,missingOrRestrictedRecords:1,unmatchedRecords:0,items:[{name:'合成测试标签',value:2}],truncated:false,unit:'幅',method:'合成规则'}]))});
export const graph = () => ({schemaVersion:1,source:'legacy-poetry-snapshot',graphSha256:'a'.repeat(64),statsSha256:'b'.repeat(64),nodeCount:2,edgeCount:1,nodes:[{id:'a',name:'合成诗人',category:'人物',size:15,description:'隔离资料'},{id:'b',name:'合成诗歌',category:'作品',size:12,description:'隔离资料'}],links:[{source:'a',target:'b',label:'创作',summary:'创作',detail:'合成关系',value:1}],entityTypes:[{name:'人物',value:1},{name:'作品',value:1}],relationTypes:[{name:'创作',value:1}],sourceLimits:['仅供隔离加载验证']});
export function newState(options={}) {return {assistant:assistantState({paginate:true,...options}),studio:studioState(),delays:{},fail:{},requests:[],writes:[],unknown:[],...options};}
export function responseFor(s,method,u,body,account='A') {
 const p=u.pathname,q=u.searchParams; s.requests.push({method,path:p,query:u.search,account,at:Date.now()});
 if(!['GET','HEAD'].includes(method)) {s.writes.push({method,path:p});return json({message:'此夹具仅允许读取'},405);}
 if(s.fail[p])return json({message:'隔离读取失败',code:'FIXTURE_READ_FAILED'},s.fail[p]);
 if(p==='/api/user/profile')return json({success:true,data:{id:account==='A'?900001:900002,username:`fixture-${account}`,fullName:`隔离账号 ${account}`,email:`${account}@example.invalid`,createdAt:null,updatedAt:null}});
 if(p.startsWith('/api/v1/assistant/'))return assistantResponse(s.assistant,method,u,body);
 if(p==='/api/v1/paintings/daily')return json(painting(90,'每日隔离山水'));
 if(p==='/api/v1/paintings'||p==='/api/v1/me/favorites/paintings'){
  const page=Number(q.get('page')||0),keyword=q.get('keyword')||'', favorites=p.includes('favorites');
  const items=Array.from({length:favorites?3:12},(_,i)=>painting(page*12+i+90,`${favorites?account+' 收藏':keyword||'隔离画作'} ${page*12+i+1}`));
  return json({...pageOf(items),page,totalPages:3,totalElements:favorites?9:36,first:page===0,last:page===2,hasNext:page<2,orderDate:'2026-10-25'});
 }
 if(p.startsWith('/api/v1/paintings/')&&!p.includes('/guide')&&!p.includes('/critic'))return json({...painting(90,'隔离详情山水'),publicFields:[],sourceSequence:'1'});
 if(p.startsWith('/api/v1/assets/'))return {status:200,body:png,contentType:'image/png'};
 if(p==='/api/v1/knowledge/painting-statistics')return json(statistics());
 if(p==='/api/v1/knowledge/poetry-graph')return json(graph());
 if(p.startsWith('/api/v1/workflow')||p.startsWith('/api/v1/creations')||p.startsWith('/api/v1/me/workflows')||p.startsWith('/api/v1/me/creations'))return studioResponse(s.studio,method,u,body);
 if(p.endsWith('/guide'))return json({message:'隔离：尚无导览'},404);
 if(p.includes('/guide/history')||p.includes('/critic'))return json({message:'隔离：暂未开放'},503);
 s.unknown.push(p);return json({message:'未配置的隔离读取'},404);
}
