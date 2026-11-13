import {configuredCommunityOrigin} from "@/lib/community-host-origin";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const apiRoots=new Set(["user","uploads","search","admin","coins","notifications","posts","comments","tags","v2","media-session","ws-ticket","operations","legacy-posts","gallery-references"]);
function failure(status:number,message:string){return Response.json({code:status,message},{status,headers:{"cache-control":"private, no-store"}});}
async function proxy(request:Request,context:{params:Promise<{path:string[]}>}){
 const parts=(await context.params).path;
 if(parts.some(value=>!/^[-\w.]+$/.test(value)||value==="."||value==="..") || !(parts[0]==="api"&&apiRoots.has(parts[1])||parts.length===2&&["uploads","legacy-media","gallery-media"].includes(parts[0])))return failure(404,"接口不存在");
 let origin:string|null;
 try{origin=await configuredCommunityOrigin();}catch{return failure(503,"社区配置暂不可用");}
 if(!origin)return failure(503,"社区暂未开放");
 const authorization=request.headers.get("authorization");
 const media=["uploads","legacy-media","gallery-media"].includes(parts[0])||parts.includes("file");
 if(!authorization&&!media)return failure(401,"请先登录");
 if(authorization&&!/^Bearer [^\s,]{1,8192}$/.test(authorization))return failure(401,"登录凭证无效");
 const forwarded=new Headers();
 for(const name of ["authorization","content-type","content-length","range","x-request-id","x-file-name","x-deepseek-key","x-deepseek-model"]){const value=request.headers.get(name);if(value)forwarded.set(name,value);}
 const browserOrigin=request.headers.get("origin");
 if(browserOrigin&&browserOrigin!==new URL(request.url).origin)return failure(403,"来源不允许");
 if(browserOrigin)forwarded.set("origin",browserOrigin);
 const cookie=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith("artlive_community_media="));
 if(cookie)forwarded.set("cookie",cookie);
 const upload=parts[1]==="uploads"||parts.at(-1)==="artwork-assets";
 const limit=upload?(parts[1]==="uploads"&&new URL(request.url).searchParams.get("type")==="video"?100:30)*1024*1024:2*1024*1024;
 if(Number(request.headers.get("content-length")||0)>limit)return failure(413,"请求内容过大");
 let bytes=0;
 const body=request.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>limit)throw new Error("REQUEST_TOO_LARGE");controller.enqueue(chunk);}}));
 try{
  const options={method:request.method,headers:forwarded,body,duplex:"half",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(upload?180000:150000)} as RequestInit;
  const upstream=await fetch(origin+"/api/v2/community/"+parts.join("/")+new URL(request.url).search,options);
  const headers=new Headers({"cache-control":"private, no-store","x-content-type-options":"nosniff"});
  for(const key of ["content-type","content-length","content-range","accept-ranges","set-cookie"]){const value=upstream.headers.get(key);if(value)headers.set(key,value);}
  return new Response(upstream.body,{status:upstream.status,headers});
 }catch{return failure(503,["GET","HEAD"].includes(request.method)?"暂时无法连接社区，请稍后重试。":"请求结果尚未确认，请读取操作记录，不要重复提交。");}
}
export const GET=proxy;export const HEAD=proxy;export const POST=proxy;export const PUT=proxy;export const PATCH=proxy;export const DELETE=proxy;
