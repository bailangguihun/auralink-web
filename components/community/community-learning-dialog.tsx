"use client";
import {useEffect,useRef} from "react";
import {CommunityScreen} from "./community-screen";

export default function CommunityLearningDialog({postId,onClose}:{postId:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 const closed=useRef(false);
 const close=()=>{if(!closed.current){closed.current=true;onClose();}};
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog ref={ref} className="community-learning-dialog community-page" onCancel={event=>{if(event.target===event.currentTarget)close();}} onClose={event=>{if(event.target===event.currentTarget)close();}} aria-label="作品成长记录">
  <header className="community-learning-header"><h2>作品成长记录</h2><button type="button" onClick={close} aria-label="关闭成长记录">×</button></header>
  <CommunityScreen postId={postId}/>
 </dialog>;
}
