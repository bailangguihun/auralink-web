"use client";

import {useEffect,useRef,useState} from "react";
import {useSession} from "@/components/session-provider";
import dynamic from "next/dynamic";
import {startPresentation} from "@/lib/content-presentation";
import {CommunityLoading} from "@/components/community/community-loading";
import {StatePanel} from "@/components/state-panel";
const CommunityLearningDialog=dynamic(()=>import('./community-learning-dialog'),{ssr:false});

type CommunityRuntime = {
 mountCommunity(host:HTMLElement, options:{
  token:string; actorId:string; isCurrent:()=>boolean; signOut:()=>void;
  openGrowth:(id:string)=>void; onShellReady:()=>void; onShellError:()=>void;
  present:(root:HTMLElement,ready:()=>boolean,regions:HTMLElement[])=>()=>void;
 }):Promise<()=>void>;
};
export function CommunityV2Screen(){
 const host=useRef<HTMLDivElement>(null);
 const {token,user,sessionIdentity,isCurrentSession,signOutIfCurrent}=useSession();
 const [shell,setShell]=useState<"loading"|"ready"|"error">("loading");
 const [growth,setGrowth]=useState<string|null>(null);
 useEffect(()=>{
  const element=host.current;if(!element||!token)return;
  let cancelled=false,cleanup:(()=>void)|undefined;
  // Native module loading keeps the reference implementation isolated and lazy.
  const url="/community-v2/runtime.mjs";
  void (import(/* webpackIgnore: true */ url) as Promise<CommunityRuntime>).then(async runtime=>{
   if(cancelled)return;
   const dispose=await runtime.mountCommunity(element,{token,actorId:String(user?.id||""),isCurrent:()=>!cancelled&&isCurrentSession(sessionIdentity),signOut:()=>{signOutIfCurrent(sessionIdentity);},openGrowth:setGrowth,
    onShellReady:()=>{if(!cancelled&&isCurrentSession(sessionIdentity))setShell("ready");},
    onShellError:()=>{if(!cancelled&&isCurrentSession(sessionIdentity))setShell("error");},
    present:(root,ready,regions)=>{
     let notice:HTMLElement|null=null;
     const presentation=startPresentation(root,{regions,ready,current:()=>!cancelled&&isCurrentSession(sessionIdentity),onTimeout:()=>{
      notice=document.createElement('p');notice.className='empty';notice.setAttribute('role','alert');notice.textContent='内容暂未准备完成，请重新切换模块、筛选或刷新页面。';(regions.length===1?regions[0]:root).after(notice);
     }});
     return()=>{presentation.cancel();notice?.remove();};
    }});
   if(cancelled)dispose();else cleanup=dispose;
  }).catch(()=>{if(!cancelled&&isCurrentSession(sessionIdentity))setShell("error");});
  return()=>{cancelled=true;cleanup?.();};
 },[token,user?.id,sessionIdentity,isCurrentSession,signOutIfCurrent]);
 return <>
  {shell==='loading'?<CommunityLoading />:null}
  {shell==='error'?<div className="community-loading-main"><StatePanel kind="error" title="社区加载失败" description="请重新加载社区。" actionLabel="重新加载" onAction={()=>window.location.reload()} /></div>:null}
  <div ref={host} className="community-v2-host" hidden={shell!=='ready'} data-testid="community-v2" data-page-ready={shell==='error'?'true':'false'} />
  {growth?<CommunityLearningDialog postId={growth} onClose={()=>{setGrowth(null);window.dispatchEvent(new CustomEvent('artlive:community-growth-updated',{detail:growth}));}}/>:null}
 </>;
}
