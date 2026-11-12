const maxAge=24*60*60*1000;
/** Adapt the existing per-account drafts and gallery entry to the reference's dedicated editor. */
export function installDrafts(body,context,options){
 const key='artlive.community.reference.draft.v1:'+options.actorId;
 const legacyKey='artlive.community.draft.v2:'+options.actorId;
 const handoffKey='artlive.community.handoff.v1:'+options.actorId;
 const form=body.querySelector('#post-form');
 const initialParams=new URLSearchParams(location.search);
 let galleryId=null,timer,restoring=false,hydrated=false;
 const get=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
 function snapshot(){return{content:form.elements.content.value,images:form.elements.images.value,audio:form.elements.audio.value,video:form.elements.video.value,tags:form.elements.tags.value,quote:context.window.communityApp?.getQuote?.()||null,galleryArtworkId:galleryId};}
 function save(){
  if(!hydrated||restoring||context.disposed()||!options.isCurrent())return;
  const draft=snapshot();
  try{if(Object.values(draft).some(Boolean))sessionStorage.setItem(key,JSON.stringify({actorId:options.actorId,savedAt:Date.now(),draft}));else sessionStorage.removeItem(key);}
  catch{context.window.communityApp?.showNotice('文字草稿暂存失败，请保留当前页面。','error');}
 }
 form.addEventListener('input',()=>{context.clearTimeout(timer);timer=context.setTimeout(save,350);});
 context.galleryReferenceId=()=>galleryId;
 context.onPublished=()=>{galleryId=null;for(const item of [key,legacyKey,handoffKey])try{sessionStorage.removeItem(item);}catch{}const url=new URL(location.href);url.searchParams.delete('paintingId');url.searchParams.delete('from');history.replaceState(history.state,'',url);};
 const originalView=context.onView;
 context.onView=view=>{save();originalView(view);};
 const originalPost=context.onPost;
 let currentPost=null;
 context.onPost=(id,post)=>{
  currentPost=post;
  originalPost(id);
  const url=new URL(location.href);url.searchParams.delete('legacyPost');history.replaceState(history.state,'',url);
  if(!post?.legacyId||!post.hasGrowth)return;
  queueMicrotask(()=>{
   if(context.disposed()||!options.isCurrent()||new URL(location.href).searchParams.get('post')!==String(id))return;
   const actions=body.querySelector('#detail .post-author');if(!actions||actions.querySelector('[data-growth]'))return;
   const button=globalThis.document.createElement('button');button.type='button';button.dataset.growth='';button.textContent='成长记录';button.className='text-button community-growth-entry';
   button.addEventListener('click',()=>options.openGrowth(post.legacyId));actions.append(button);
  });
 };
 context.window.addEventListener('artlive:community-growth-updated',event=>{if(!context.disposed()&&currentPost?.legacyId===event.detail)void context.runTask(context.window.communityApp.openDetail(currentPost.id,{preserveScroll:true}));});
 const ready=context.onReady;
 context.onReady=()=>{
  ready();
  void restore().catch(error=>{if(!context.disposed()&&options.isCurrent())context.window.communityApp.showNotice(error.message,'error');});
 };
 async function restore(){
  const params=initialParams,app=context.window.communityApp;
  const saved=get(key),legacy=get(legacyKey),handoff=get(handoffKey);
  let draft=saved?.actorId===options.actorId&&Date.now()-saved.savedAt<maxAge?saved.draft:null;
  if(!draft&&legacy?.actorId===options.actorId&&Date.now()-legacy.savedAt<maxAge&&legacy.draft){
   const previous=legacy.draft;draft={content:[previous.title,previous.content,previous.goal].filter(Boolean).join('\n\n'),tags:previous.tags||'',images:(Array.isArray(previous.images)?previous.images:[]).slice(0,9).map(image=>'/api/community/v2/legacy-media/'+image.id).join(','),galleryArtworkId:previous.paintingId||null};
  }
  const incoming=handoff?.actorId===options.actorId&&Date.now()-handoff.savedAt<maxAge&&handoff.handoff?.target==='community'?handoff.handoff:null;
  if(params.get('from')==='assistant'&&incoming&&(!draft?.content||confirm('载入助手草稿并替换当前文字草稿？'))){draft={content:[incoming.title,incoming.text].filter(Boolean).join('\n\n')};sessionStorage.removeItem(handoffKey);}
  if(params.get('paintingId')){
   const result=await app.api('/api/gallery-references/'+encodeURIComponent(params.get('paintingId'))),painting=result.data;
   draft={...(draft||{}),content:draft?.content||`分享馆藏《${painting.title}》${painting.authorName?' · '+painting.authorName:''}\n\n`,galleryArtworkId:painting.paintingId,images:painting.image?'/api/community/v2/gallery-media/'+painting.image.assetId:'',tags:draft?.tags||'馆藏分享'};
  }
  if(context.disposed()||!options.isCurrent())return;
  if(draft){
   restoring=true;
   for(const name of ['content','images','audio','video','tags'])if(typeof draft[name]==='string')form.elements[name].value=draft[name];
   galleryId=typeof draft.galleryArtworkId==='string'?draft.galleryArtworkId:null;
   app.setQuote?.(draft.quote||null);app.revealMediaLinks?.();restoring=false;
  }
  hydrated=true;
  if(params.get('legacyPost')){const result=await app.api('/api/legacy-posts/'+encodeURIComponent(params.get('legacyPost')));if(!context.disposed())await app.openDetail(result.data.id);return;}
  if(draft&&(params.has('paintingId')||params.get('from')==='assistant'))app.go('create');
  save();
 }
 return ()=>{context.clearTimeout(timer);save();};
}
