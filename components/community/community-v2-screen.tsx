"use client";

import {useEffect,useRef,useState} from "react";
import {useSession} from "@/components/session-provider";
import dynamic from "next/dynamic";
const CommunityLearningDialog=dynamic(()=>import('./community-learning-dialog'),{ssr:false});

type CommunityRuntime = {mountCommunity(host:HTMLElement, options:{token:string;actorId:string;isCurrent:()=>boolean;signOut:()=>void;openGrowth:(id:string)=>void}):Promise<()=>void>};
export function CommunityV2Screen(){
 const host=useRef<HTMLDivElement>(null);
 const {token,user,sessionIdentity,isCurrentSession,signOutIfCurrent}=useSession();
 const [error,setError]=useState("");
 const [growth,setGrowth]=useState<string|null>(null);
 useEffect(()=>{
  const element=host.current;if(!element||!token)return;
  let cancelled=false,cleanup:(()=>void)|undefined;
  // Native module loading keeps the reference implementation isolated and lazy.
  const url="/community-v2/runtime.mjs";
  void (import(/* webpackIgnore: true */ url) as Promise<CommunityRuntime>).then(async runtime=>{
   if(cancelled)return;
   const dispose=await runtime.mountCommunity(element,{token,actorId:String(user?.id||""),isCurrent:()=>!cancelled&&isCurrentSession(sessionIdentity),signOut:()=>{signOutIfCurrent(sessionIdentity);},openGrowth:setGrowth});
   if(cancelled)dispose();else cleanup=dispose;
  }).catch(()=>{if(!cancelled)setError("社区加载失败，请刷新页面重试。");});
  return()=>{cancelled=true;cleanup?.();};
 },[token,user?.id,sessionIdentity,isCurrentSession,signOutIfCurrent]);
 return <>{error?<p role="alert">{error}</p>:null}<div ref={host} data-testid="community-v2" />{growth?<CommunityLearningDialog postId={growth} onClose={()=>{setGrowth(null);window.dispatchEvent(new CustomEvent('artlive:community-growth-updated',{detail:growth}));}}/>:null}</>;
}
