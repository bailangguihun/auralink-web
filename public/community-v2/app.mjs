// Adapted from 国画社区系统2.0; see docs/community-v2-reference.md.
export function mountPosts(context) {
const {document,window,fetch,localStorage,location,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame} = context;
const $ = selector => document.querySelector(selector);
const authScreen = $('#auth-screen');
const appScreen = $('#app-screen');
const notice = $('#notice');
let token = localStorage.getItem('guohua_token');
let current = null;
let feedPage = 1;
let feedMode = 'home';
let activeAgentId = null;
let sessionDeepSeekKey = '';
let coinWallet = null;
let activeCoinPostId = null;
let quotedPostDraft = null;
let activeView = 'home';
let detailOriginView = null;
let homeScrollY = 0;
let activeDetailPostId = null;

function showNotice(message, type = 'success') {
  if(context.disposed())return;
  notice.textContent = message;
  notice.className = `notice ${type}`;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => { notice.textContent = ''; notice.className = 'notice'; }, 3500);
}
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function renderLinkedText(value = '') {
  const source = String(value);
  const urls = /https?:\/\/[^\s<>"']+/g;
  let html = '', offset = 0;
  for (const match of source.matchAll(urls)) {
    html += escapeHtml(source.slice(offset, match.index)).replace(/\n/g, '<br>');
    const raw = match[0].replace(/[。，；！）》]+$/, '');
    const trailing = match[0].slice(raw.length);
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('不支持的链接');
      html += `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(raw)}</a>${escapeHtml(trailing)}`;
    } catch { html += escapeHtml(match[0]); }
    offset = match.index + match[0].length;
  }
  return html + escapeHtml(source.slice(offset)).replace(/\n/g, '<br>');
}
function mediaInputUrl(value){return value&&String(value).startsWith('/')?new URL(value,location.origin).href:(value||'');}
function formatTime(value) { const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z')); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
async function api(url, options = {}) {
  const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const result = await response.json();
  if (response.status === 401 && token) { localStorage.removeItem('guohua_token'); token = null; current = null; showAuth(); }
  if (!response.ok) { const error = new Error(result.error?.message || result.message || '操作失败'); error.code = result.error?.code; error.details = result.error?.details; throw error; }
  return result;
}
function showAuth() { context.signOut(); }
function showApp() { authScreen.classList.add('hidden'); appScreen.classList.remove('hidden'); }
function avatar(user, cls = '') { const letter = escapeHtml((user?.nickname || user?.username || '墨').slice(0, 1)); return user?.avatar ? `<img class="avatar ${cls}" src="${escapeHtml(user.avatar)}" alt="" />` : `<span class="avatar ${cls}">${letter}</span>`; }
function setProfileEntry(user) { const entry = $('#profile-entry'); entry.innerHTML = user?.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="" />` : escapeHtml((user?.nickname || user?.username || '墨').slice(0, 1)); }
async function refreshCoinBalance() { if(!current)return;try{const result=await api('/api/coins/wallet');coinWallet=result.data;$('#coin-balance-entry').textContent=`墨币 ${coinWallet.balance}`;}catch{$('#coin-balance-entry').textContent='墨币 --';} }
async function openCoinDialog(postId) { activeCoinPostId=Number(postId);await refreshCoinBalance();$('#coin-dialog-balance').textContent=`当前余额：${coinWallet?.balance??0} 枚`;$('#coin-dialog').showModal(); }
async function contributeCoins(amount) { if(!activeCoinPostId)return;const button=$(`[data-coin-amount="${amount}"]`);if(!confirm(`确定为这幅作品投 ${amount} 枚墨币吗？投币后不能主动撤回。`))return;button.disabled=true;try{const idempotencyKey=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;const result=await api(`/api/posts/${activeCoinPostId}/coins`,{method:'POST',body:JSON.stringify({amount,idempotencyKey})});coinWallet=result.data.wallet;$('#coin-dialog').close();$('#coin-balance-entry').textContent=`墨币 ${coinWallet.balance}`;showNotice(result.message);if(document.querySelector('#view-detail:not(.hidden)'))openDetail(activeCoinPostId,{preserveScroll:true});else if(feedMode==='home')await refreshHomePost(activeCoinPostId);else loadList(feedMode);}catch(error){showNotice(error.message,'error');await refreshCoinBalance();$('#coin-dialog-balance').textContent=`当前余额：${coinWallet?.balance??0} 枚`;}finally{button.disabled=false;} }
function quoteCard(quote,{expanded=false}={}){if(!quote)return '';if(!quote.available)return `<div class="quoted-post unavailable"><span>引用内容</span><p>${escapeHtml(quote.message||'原帖已删除或不可查看')}</p></div>`;const author=quote.author?.nickname||quote.author?.username||'匿名';const summary=String(quote.content||'').slice(0,80);return `<details class="quoted-post" ${expanded?'open':''}><summary><span>引用 @${escapeHtml(author)}${quote.edited?' · 原帖已编辑':''}</span><p>${escapeHtml(summary)}${quote.content?.length>80?'…':''}</p></summary><div class="quoted-post-expanded"><p>${escapeHtml(quote.content||'').replace(/\n/g,'<br>')}</p>${quote.firstImage?`<img src="${escapeHtml(quote.firstImage)}" alt="原帖首图" loading="lazy" />`:''}<button type="button" data-quoted-post="${quote.id}">查看原帖</button></div></details>`;}
function renderQuoteCompose(){const panel=$('#quote-compose-panel');if(!quotedPostDraft){panel.innerHTML='';panel.classList.add('hidden');return;}panel.classList.remove('hidden');panel.innerHTML=`<header><div><span class="eyebrow">QUOTED POST</span><h3>正在引用这篇帖子</h3></div><button id="cancel-quote-draft" class="text-button" type="button">取消引用</button></header>${quoteCard(quotedPostDraft,{expanded:true})}<p class="muted">请至少写下 1 个字的自己的观点。引用内容不会复制媒体文件。</p>`;$('#cancel-quote-draft').addEventListener('click',()=>{quotedPostDraft=null;renderQuoteCompose();});}
async function startQuote(postId){try{const result=await api(`/api/posts/${postId}`);const post=result.data.post;if(post.author?.id===current?.id)return showNotice('不能引用自己的帖子','error');quotedPostDraft={id:post.id,available:true,content:post.content,firstImage:post.images?.[0]||null,author:post.author,createTime:post.createTime,edited:false};renderQuoteCompose();go('create');$('#post-form textarea[name="content"]').focus();}catch(error){showNotice(error.message,'error');}}
async function refreshNotificationBadge(){if(!current)return;try{const result=await api('/api/notifications');const badge=$('#notification-badge');badge.textContent=result.data.unread;badge.classList.toggle('hidden',!result.data.unread);}catch{}}
function aiCredentialHeaders() { const headers = {}; const key = $('#deepseek-key')?.value.trim() || sessionDeepSeekKey; const model = $('#deepseek-model')?.value.trim() || 'deepseek-chat'; if (key) { sessionDeepSeekKey = key; headers['X-DeepSeek-Key'] = key; headers['X-DeepSeek-Model'] = model; } return headers; }
const uploadLimits = { image:10 * 1024 * 1024, audio:30 * 1024 * 1024, video:100 * 1024 * 1024 };
let uploadPreviewUrls = [];
function fileMimeType(file) { if (file.type) return file.type; const extension = file.name.split('.').pop().toLowerCase(); return ({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', m4a:'audio/mp4', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime' })[extension] || 'application/octet-stream'; }
async function uploadFile(file, type) { if (file.size > uploadLimits[type]) throw new Error(`${file.name} 超过大小限制`); const headers = { 'Content-Type':fileMimeType(file) }; if (token) headers.Authorization = `Bearer ${token}`; const response = await fetch(`/api/uploads?type=${type}`, { method:'POST', headers, body:file }); const result = await response.json(); if (response.status === 401) { localStorage.removeItem('guohua_token'); token = null; current = null; showAuth(); } if (!response.ok) throw new Error(result.message || `${file.name} 上传失败`); return result.data.url; }
function renderUploadSelection() { uploadPreviewUrls.forEach(URL.revokeObjectURL); uploadPreviewUrls = []; const images = [...$('#post-image-files').files]; const audio = $('#post-audio-file').files[0]; const video = $('#post-video-file').files[0]; const target = $('#upload-selection'); if (!images.length && !audio && !video) { target.innerHTML = ''; target.classList.add('hidden'); return; } const imageHtml = images.map(file => { const url = URL.createObjectURL(file); uploadPreviewUrls.push(url); return `<article><img src="${url}" alt="" /><span>${escapeHtml(file.name)}</span></article>`; }).join(''); const mediaHtml = [audio ? `<p><strong>音频</strong> ${escapeHtml(audio.name)}</p>` : '', video ? `<p><strong>视频</strong> ${escapeHtml(video.name)}</p>` : ''].join(''); target.innerHTML = `<div>${imageHtml}</div>${mediaHtml}`; target.classList.remove('hidden'); }

function postCard(post) {
  const images = (post.images || []).slice(0, 3).map(src => `<img src="${escapeHtml(src)}" alt="作品图片" loading="lazy" />`).join('');
  const museumImageClass = (post.images || []).some(src => String(src).startsWith('https://openaccess-cdn.clevelandart.org/')) ? ' museum-artwork' : '';
  const tags = (post.tags || []).map(tag => `<button class="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('');
  const identity = post.author?.role === 'ai' ? '<span class="ai-badge">AI创作账号</span>' : '';
  return `<article class="post-card"><div class="post-author">${avatar(post.author)}<div><strong>${escapeHtml(post.author?.nickname || '匿名')} ${identity}</strong><small>@${escapeHtml(post.author?.username || '')} · ${formatTime(post.createTime)}</small></div>${post.pinned ? '<span class="pinned">置顶</span>' : ''}</div><button class="post-body" data-post="${post.id}"><p>${escapeHtml(post.content).replace(/\n/g, '<br>')}</p>${images ? `<div class="post-images count-${Math.min(3, post.images.length)}${museumImageClass}">${images}</div>` : ''}</button>${quoteCard(post.quote)}<div class="post-tags">${tags}</div><div class="post-actions"><button data-action="like" data-id="${post.id}" class="${post.liked ? 'is-active' : ''}">♡ ${post.likeCount}</button><button data-action="comment" data-id="${post.id}">▢ ${post.commentCount}</button><button data-action="coin" data-id="${post.id}" ${post.author?.id===current?.id?'disabled title="不能给自己的作品投币"':''} class="${post.myCoinCount?'is-active':''}">◈ ${post.coinCount}${post.aiCoinCount?` · AI示范${post.aiCoinCount}`:''}${post.myCoinCount?` · 已投${post.myCoinCount}`:''}</button><button data-action="favorite" data-id="${post.id}" class="${post.favorited ? 'is-active' : ''}">☆ ${post.favorited ? '已收藏' : '收藏'}</button>${post.author?.id!==current?.id?`<button data-action="quote" data-id="${post.id}">↗ 引用</button>`:''}</div></article>`;
}
function syncHomePostCard(post) {
  const oldCard = $(`#feed [data-post="${Number(post.id)}"]`)?.closest('.post-card');
  if (!oldCard) return;
  const quoteExpanded = Boolean(oldCard.querySelector('.quoted-post[open]'));
  const template = document.createElement('template');
  template.innerHTML = postCard(post);
  const newCard = template.content.firstElementChild;
  if (quoteExpanded) newCard.querySelector('.quoted-post')?.setAttribute('open', '');
  oldCard.replaceWith(newCard);
  bindPostEvents(newCard);
}
async function refreshHomePost(id) {
  const result = await api(`/api/posts/${id}`);
  syncHomePostCard(result.data.post);
}
function bindPostEvents(root = document) {
  root.querySelectorAll('[data-post]').forEach(element => element.addEventListener('click', () => openDetail(Number(element.dataset.post))));
  root.querySelectorAll('[data-action]').forEach(element => element.addEventListener('click', context.guardEvent(async event => {
    event.stopPropagation();
    if (element.dataset.action === 'comment') return openDetail(Number(element.dataset.id));
    if(element.dataset.action==='coin')return openCoinDialog(element.dataset.id);
    if(element.dataset.action==='quote')return startQuote(Number(element.dataset.id));
    try { const result = await api(`/api/posts/${element.dataset.id}/${element.dataset.action}`, { method:'POST' }); showNotice(result.message); if (feedMode === 'home') await refreshHomePost(element.dataset.id); else loadList(feedMode); }
    catch (error) { showNotice(error.message, 'error'); }
  })));
  root.querySelectorAll('[data-tag]').forEach(element => element.addEventListener('click', event => { event.stopPropagation(); $('#search-input').value = `#${element.dataset.tag}`; go('home'); }));
  root.querySelectorAll('[data-quoted-post]').forEach(element=>element.addEventListener('click',event=>{event.stopPropagation();openDetail(Number(element.dataset.quotedPost));}));
}
function renderSearchUsers(users, query) {
  const target = $('#search-users');
  if (!query || !users.length) { target.classList.add('hidden'); target.innerHTML = ''; return; }
  target.classList.remove('hidden');
  target.innerHTML = `<h3>相关用户</h3><div>${users.map(user => `<article class="user-result">${avatar(user)}<span><strong>${escapeHtml(user.nickname)} ${user.role === 'ai' ? '<span class="ai-badge">AI创作账号</span>' : ''}</strong><small>@${escapeHtml(user.username)}</small></span></article>`).join('')}</div>`;
}
async function loadFeed(reset = false) {
  if (reset) feedPage = 1;
  const query = $('#search-input').value.trim();
  try {
    let items; let hasMore;
    if (query) {
      const result = await api(`/api/search?q=${encodeURIComponent(query)}&page=${feedPage}`);
      items = result.data.posts; hasMore = result.data.hasMore; renderSearchUsers(result.data.users, query);
    } else {
      renderSearchUsers([], '');
      const result = await api(`/api/posts?page=${feedPage}&sort=${$('#sort-select').value}`);
      items = result.data.items; hasMore = result.data.hasMore;
    }
    const html = items.map(postCard).join('');
    $('#feed').innerHTML = reset || feedPage === 1 ? (html || '<p class="empty">没有找到相关内容。</p>') : $('#feed').innerHTML + html;
    $('#load-more').classList.toggle('hidden', !hasMore);
    bindPostEvents($('#feed'));
  } catch (error) { $('#feed').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}
async function loadList(mode) {
  feedMode = mode;
  const target = mode === 'mine' ? $('#mine-feed') : $('#favorite-feed');
  target.innerHTML = '<p class="empty">正在加载…</p>';
  try { const result = await api(`/api/posts?page=1&pageSize=30&${mode}=1`); target.innerHTML = result.data.items.length ? result.data.items.map(postCard).join('') : '<p class="empty">这里还没有内容。</p>'; bindPostEvents(target); }
  catch (error) { target.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}
async function loadTags() {
  try {
  const result = await api('/api/tags');
  const tags = result.data;
  $('#all-tags').innerHTML = tags.length ? tags.map(tag => `<button class="tag large" data-tag="${escapeHtml(tag.name)}">#${escapeHtml(tag.name)} <small>${tag.postCount}</small></button>`).join('') : '<p class="empty">还没有标签。</p>';
  $('#tag-strip').innerHTML = tags.slice(0, 12).map(tag => `<button class="tag" data-tag="${escapeHtml(tag.name)}">#${escapeHtml(tag.name)}</button>`).join('');
  document.querySelectorAll('#all-tags [data-tag], #tag-strip [data-tag]').forEach(element => element.addEventListener('click', () => { $('#search-input').value = `#${element.dataset.tag}`; go('home'); }));

  } catch(error) { if(!context.isCancelled(error))throw error; }
}
async function openDetail(id,{preserveScroll=false}={}) { const scrollY=preserveScroll&&activeView==='detail'&&activeDetailPostId===id?window.scrollY:null;activeDetailPostId=id;go('detail');$('#detail').innerHTML='<p class="empty">正在加载…</p>';try{const result=await api(`/api/posts/${id}`);renderDetail(result.data);if(scrollY!==null)requestAnimationFrame(()=>window.scrollTo(0,scrollY));}catch(error){$('#detail').innerHTML=`<p class="empty">${escapeHtml(error.message)}</p>`;} }
function renderDetail(data) {
  context.onPost(data.post.id,data.post);
  const post = data.post; const comments = data.comments || [];
  activeDetailPostId = post.id;
  syncHomePostCard(post);
  const commentHtml = comments.map(comment => `<div class="comment ${comment.parentId ? 'reply' : ''}">${avatar(comment.author)}<div class="comment-main"><div><strong>${escapeHtml(comment.author?.nickname || '匿名')} ${comment.author?.role==='ai'?'<span class="ai-badge">AI评论</span>':''}</strong>${comment.replyUser ? ` <span class="muted">回复 ${escapeHtml(comment.replyUser.nickname)}</span>` : ''}<small>${formatTime(comment.createTime)}</small></div><p>${escapeHtml(comment.content)}</p><div class="comment-actions"><button data-comment-like="${comment.id}" class="${comment.liked ? 'is-active' : ''}">♡ ${comment.likeCount}</button><button data-reply="${comment.id}" data-reply-user="${comment.author?.id || ''}">回复</button>${comment.author?.id === current?.id || current?.role === 'admin' ? `<button data-delete-comment="${comment.id}">删除</button>` : ''}</div></div></div>`).join('');
  const media = (post.images || []).map(src => `<img src="${escapeHtml(src)}" alt="作品图片" />`).join('');
  const aiBadge = post.author?.role === 'ai' ? '<span class="ai-badge">AI创作账号</span>' : '';
  $('#detail').innerHTML = `<article class="detail-card"><div class="post-author">${avatar(post.author)}<div><strong>${escapeHtml(post.author?.nickname || '匿名')} ${aiBadge}</strong><small>@${escapeHtml(post.author?.username || '')} · ${formatTime(post.createTime)}</small></div></div><div class="detail-content"><p>${renderLinkedText(post.content)}</p>${media ? `<div class="detail-images">${media}</div>` : ''}${post.audio ? `<audio controls src="${escapeHtml(post.audio)}"></audio>` : ''}${post.video ? `<video controls src="${escapeHtml(post.video)}"></video>` : ''}${quoteCard(post.quote)}<div class="post-tags">${post.tags.map(tag => `<button class="tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`).join('')}</div></div><div class="detail-actions"><button id="detail-like" class="${post.liked ? 'is-active' : ''}">♡ 点赞 ${post.likeCount}</button><button id="detail-coin" ${post.author?.id===current?.id?'disabled':''} class="${post.myCoinCount?'is-active':''}">◈ 墨币 ${post.coinCount}${post.aiCoinCount?` · AI示范${post.aiCoinCount}`:''}${post.myCoinCount?` · 已投${post.myCoinCount}`:''}</button><button id="detail-favorite" class="${post.favorited ? 'is-active' : ''}">☆ ${post.favorited ? '已收藏' : '收藏'}</button>${post.author?.id!==current?.id?'<button id="detail-quote">↗ 引用</button>':''}${post.author?.id===current?.id&&post.quote?'<button id="detail-remove-quote">移除引用</button>':''}${post.author?.id === current?.id || current?.role === 'admin' ? '<button id="detail-delete" class="danger-text">删除帖子</button>' : ''}</div><section class="comments"><h3>评论 <span>${post.commentCount}</span></h3><form id="comment-form" class="comment-form"><textarea name="content" rows="3" placeholder="写下你的看法…"></textarea><input type="hidden" name="parentId" /><input type="hidden" name="replyUserId" /><button class="primary compact">发表评论</button></form><div class="comment-list">${commentHtml || '<p class="empty">还没有评论，来做第一个分享感受的人。</p>'}</div></section></article>`;
  $('#detail-like').addEventListener('click', context.guardEvent(async () => { await api(`/api/posts/${post.id}/like`, { method:'POST' }); openDetail(post.id,{preserveScroll:true}); }));
  $('#detail-coin').addEventListener('click',()=>openCoinDialog(post.id));
  $('#detail-favorite').addEventListener('click', context.guardEvent(async () => { await api(`/api/posts/${post.id}/favorite`, { method:'POST' }); openDetail(post.id,{preserveScroll:true}); }));
  $('#detail-quote')?.addEventListener('click',()=>startQuote(post.id));
  $('#detail-remove-quote')?.addEventListener('click',context.guardEvent(async()=>{if(!confirm('移除引用后，这篇帖子会变为普通帖子，确定继续吗？'))return;try{const result=await api(`/api/posts/${post.id}/quote`,{method:'DELETE'});showNotice(result.message);openDetail(post.id,{preserveScroll:true});}catch(error){showNotice(error.message,'error');}}));
  $('#detail').querySelectorAll('[data-quoted-post]').forEach(button=>button.addEventListener('click',()=>openDetail(Number(button.dataset.quotedPost))));
  $('#comment-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); try { await api(`/api/posts/${post.id}/comments`, { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.target))) }); openDetail(post.id,{preserveScroll:true}); } catch (error) { showNotice(error.message, 'error'); } }));
  $('#detail').querySelectorAll('[data-reply]').forEach(button => button.addEventListener('click', () => { $('#comment-form [name="parentId"]').value = button.dataset.reply; $('#comment-form [name="replyUserId"]').value = button.dataset.replyUser; $('#comment-form textarea').focus(); }));
  $('#detail').querySelectorAll('[data-comment-like]').forEach(button => button.addEventListener('click', context.guardEvent(async () => { await api(`/api/comments/${button.dataset.commentLike}/like`, { method:'POST' }); openDetail(post.id,{preserveScroll:true}); })));
  $('#detail').querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', context.guardEvent(async () => { if (!confirm('确定删除这条评论吗？')) return; const url = current.role === 'admin' ? `/api/admin/comments/${button.dataset.deleteComment}` : `/api/comments/${button.dataset.deleteComment}`; await api(url, { method:'DELETE' }); openDetail(post.id,{preserveScroll:true}); })));
  $('#detail').querySelectorAll('[data-tag]').forEach(button => button.addEventListener('click', () => { $('#search-input').value = `#${button.dataset.tag}`; go('home'); }));
  $('#detail-delete')?.addEventListener('click', context.guardEvent(async () => { if (!confirm('确定删除这篇帖子吗？')) return; const url = current.role === 'admin' ? `/api/admin/posts/${post.id}` : `/api/posts/${post.id}`; await api(url, { method:'DELETE' }); showNotice('帖子已删除'); detailOriginView=null; go('home'); }));
}

async function loadAi() {
  try {
    const result = await api('/api/ai/agents');
    $('#ai-agents').innerHTML = result.data.map(agent => `<button class="agent-card ${agent.id === activeAgentId ? 'active' : ''}" data-agent="${agent.id}">${agent.avatar ? `<img src="${escapeHtml(agent.avatar)}" alt="" />` : '<span>诗</span>'}<strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.persona)}</small></button>`).join('');
    $('#ai-agents').querySelectorAll('[data-agent]').forEach(button => button.addEventListener('click', () => selectAgent(Number(button.dataset.agent))));
    if (!activeAgentId && result.data[0]) selectAgent(result.data[0].id);
  } catch (error) { $('#ai-agents').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}
async function loadCoins(){const summary=$('#coin-wallet-summary'),tasks=$('#coin-task-list'),ledger=$('#coin-ledger-list');summary.innerHTML='<p class="empty">正在读取钱包…</p>';try{const [taskResult,ledgerResult]=await Promise.all([api('/api/coins/tasks'),api('/api/coins/ledger?limit=50')]);coinWallet=taskResult.data.wallet;$('#coin-balance-entry').textContent=`墨币 ${coinWallet.balance}`;summary.innerHTML=`<article><span>当前余额</span><strong>${coinWallet.balance}</strong><small>枚墨币</small></article><article><span>累计获得</span><strong>${coinWallet.lifetimeEarned}</strong><small>不可充值或提现</small></article><article><span>累计使用</span><strong>${coinWallet.lifetimeSpent}</strong><small>用于支持作品</small></article>`;tasks.innerHTML=taskResult.data.items.map(task=>{const percent=Math.min(100,Math.round(task.progress/task.target*100));const state=task.claimable?`<button class="primary compact" data-claim-task="${task.code}">领取 ${task.reward} 枚</button>`:task.completed?'<span class="task-state">已领取</span>':'<span class="task-state">未完成</span>';return `<article class="coin-task"><div><strong>${escapeHtml(task.name)}</strong><p>${escapeHtml(task.description)}</p>${task.limitText?`<small>${escapeHtml(task.limitText)}</small>`:''}</div><div class="task-progress"><span style="width:${percent}%"></span></div><small>${task.progress}/${task.target}</small>${state}</article>`;}).join('');tasks.querySelectorAll('[data-claim-task]').forEach(button=>button.addEventListener('click',context.guardEvent(async()=>{button.disabled=true;try{const result=await api(`/api/coins/tasks/${button.dataset.claimTask}/claim`,{method:'POST',body:'{}'});showNotice(result.message);await loadCoins();}catch(error){showNotice(error.message,'error');button.disabled=false;}})));const items=ledgerResult.data.items;ledger.innerHTML=items.length?items.map(item=>`<article class="coin-ledger-row"><span class="${item.amount>0?'coin-in':'coin-out'}">${item.amount>0?'+':''}${item.amount}</span><div><strong>${escapeHtml(item.description)}</strong><small>${formatTime(item.createdAt)} · 余额 ${item.balanceAfter}</small></div></article>`).join(''):'<p class="empty">暂无墨币流水。</p>';}catch(error){summary.innerHTML=`<p class="empty">${escapeHtml(error.message)}</p>`;tasks.innerHTML='';ledger.innerHTML='';}}
async function loadRoomIncome(){try{const [wallet,income]=await Promise.all([api('/api/coins/wallet'),api('/api/coins/room-income')]);$('#room-income-summary').textContent=`可支付房间门票的任务墨币：${wallet.data.roomSpendable} 枚（初始赠币不可用于门票） · 待结算房费：${income.data.pending} 枚 · 已结算房费：${income.data.settled} 枚${income.data.refundDebt?` · 待抵扣退款：${income.data.refundDebt} 枚`:''}。房费满 7 天后，在认证有效且房间开放时结算。`;}catch(error){$('#room-income-summary').textContent=error.message;}}
async function loadNotifications(){const target=$('#notification-list');target.innerHTML='<p class="empty">正在加载通知…</p>';try{const result=await api('/api/notifications');const items=result.data.items;target.innerHTML=items.length?items.map(item=>`<article class="notification-row ${item.readAt?'':'unread'}"><div>${avatar(item.actor,'mini')}</div><button data-notification-post="${item.targetId}"><strong>${escapeHtml(item.message)}</strong><small>${formatTime(item.createTime)}</small></button></article>`).join(''):'<p class="empty">还没有通知。</p>';target.querySelectorAll('[data-notification-post]').forEach(button=>button.addEventListener('click',()=>openDetail(Number(button.dataset.notificationPost))));await api('/api/notifications/read',{method:'POST',body:'{}'});refreshNotificationBadge();}catch(error){target.innerHTML=`<p class="empty">${escapeHtml(error.message)}</p>`;}}
async function selectAgent(id) {
  try {
  activeAgentId = id; await loadAi();
  const result = await api(`/api/ai/agents/${id}/messages`); const agent = result.data.agent;
  $('#chat-header').innerHTML = `<div>${agent.avatar ? `<img src="${escapeHtml(agent.avatar)}" alt="" />` : ''}<span><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.persona)}</small></span></div>`;
  renderMessages(result.data.messages);

  } catch(error) { if(!context.isCancelled(error))throw error; }
}
function renderMessages(messages) { const target = $('#chat-messages'); target.innerHTML = messages.length ? messages.map(message => `<div class="chat-message ${message.role}"><p>${escapeHtml(message.content)}</p><small>${formatTime(message.createTime)}</small></div>`).join('') : '<p class="empty">从一句诗、一幅画或一个历史问题开始。</p>'; target.scrollTop = target.scrollHeight; }

async function loadAdmin() {
  try {
  if (current?.role !== 'admin') return;
  const result = await api('/api/admin/overview');
  const labels = { users:'用户总数', activeUsers:'正常用户', posts:'在线帖子', comments:'评论总数', aiMessages:'AI对话' };
  $('#admin-overview').innerHTML = Object.entries(result.data).map(([key, value]) => `<article><strong>${value}</strong><span>${labels[key]}</span></article>`).join('');
  await Promise.all([loadAdminUsers(), loadAdminPosts(), loadAdminAi(),loadAdminRoomPayments()]);

  } catch(error) { if(!context.isCancelled(error))throw error; }
}
async function loadAdminUsers() {
  try {
  const query = $('#admin-user-search').value.trim(); const status = $('#admin-user-status').value;
  const result = await api(`/api/admin/users?q=${encodeURIComponent(query)}&status=${status}`);
  $('#admin-user-list').innerHTML = result.data.map(user => `<article class="data-row"><div>${avatar(user)}<span><strong>${escapeHtml(user.nickname)} ${user.expertVerified?'<span class="expert-badge">认证专家</span>':''}</strong><small>@${escapeHtml(user.username)} · ${user.postCount} 篇帖子 · ${user.role === 'admin' ? '管理员' : user.status ? '已封禁' : '正常'}</small></span></div>${user.role === 'admin' ? '<span class="state-label">不可操作</span>' : `<div class="admin-user-actions"><button class="secondary inline" data-user-expert="${user.id}" data-next-expert="${user.expertVerified?'0':'1'}">${user.expertVerified?'撤销专家认证':'认证为专家'}</button><button class="${user.status ? 'secondary inline' : 'danger-button'}" data-user-status="${user.id}" data-next-status="${user.status ? 0 : 1}">${user.status ? '解除封禁' : '封禁用户'}</button></div>`}</article>`).join('') || '<p class="empty">没有用户记录。</p>';
  $('#admin-user-list').querySelectorAll('[data-user-status]').forEach(button => button.addEventListener('click', context.guardEvent(async () => { const result = await api(`/api/admin/users/${button.dataset.userStatus}/status`, { method:'PATCH', body:JSON.stringify({ status:Number(button.dataset.nextStatus) }) }); showNotice(result.message); loadAdminUsers(); })));
  $('#admin-user-list').querySelectorAll('[data-user-expert]').forEach(button=>button.addEventListener('click',context.guardEvent(async()=>{const verified=button.dataset.nextExpert==='1';if(!verified&&!confirm('撤销后，该专家的墨币房间将暂停新付费加入。确定继续吗？'))return;try{const result=await api(`/api/admin/users/${button.dataset.userExpert}/expert`,{method:'PATCH',body:JSON.stringify({verified})});showNotice(result.message);loadAdminUsers();}catch(error){showNotice(error.message,'error');}})));

  } catch(error) { if(!context.isCancelled(error))throw error; }
}
async function loadAdminRoomPayments(){const parent=$('#admin-users');let panel=$('#admin-room-payments');if(!panel){parent.insertAdjacentHTML('beforeend','<section id="admin-room-payments" class="admin-room-payments"><h3>墨币房间收费记录</h3><p class="muted">认证失效期间会暂停新收费，待结算收入保留在记录中。</p><div id="admin-room-payment-list"></div></section>');panel=$('#admin-room-payments');}try{const result=await api('/api/admin/room-payments');const label={pending:'待结算',settled:'已结算',refunded:'已退款'};$('#admin-room-payment-list').innerHTML=result.data.items.length?result.data.items.map(item=>`<article class="data-row"><div><strong>${escapeHtml(item.roomName)} · ${item.amount} 墨币</strong><small>付款用户 #${item.payerId} · 收款专家 #${item.recipientId} · ${label[item.status]||item.status} · ${formatTime(item.createdAt)}</small></div><div class="admin-user-actions">${item.status!=='refunded'?`<button class="secondary inline" data-admin-refund="${item.id}">退款</button>`:''}<button class="danger-button" data-admin-close-room="${escapeHtml(item.roomId)}">关闭房间</button></div></article>`).join(''):'<p class="muted">暂无墨币房间收费记录。</p>';panel.querySelectorAll('[data-admin-refund]').forEach(button=>button.addEventListener('click',context.guardEvent(async()=>{if(!confirm('确定向付款用户退还这笔房间门票吗？'))return;try{const result=await api(`/api/admin/room-payments/${button.dataset.adminRefund}/refund`,{method:'POST',body:'{}'});showNotice(result.message);loadAdminRoomPayments();}catch(error){showNotice(error.message,'error');}})));panel.querySelectorAll('[data-admin-close-room]').forEach(button=>button.addEventListener('click',context.guardEvent(async()=>{if(!confirm('关闭房间将停止新加入并退还待结算门票，确定继续吗？'))return;try{const result=await api(`/api/admin/paid-rooms/${button.dataset.adminCloseRoom}/close`,{method:'POST',body:'{}'});showNotice(result.message);loadAdminRoomPayments();}catch(error){showNotice(error.message,'error');}})));}catch(error){$('#admin-room-payment-list').innerHTML=`<p class="muted">${escapeHtml(error.message)}</p>`;}}
async function loadAdminPosts() {
  try {
  const result = await api(`/api/admin/posts?q=${encodeURIComponent($('#admin-post-search').value.trim())}`);
  $('#admin-post-list').innerHTML = result.data.map(post => `<article class="data-row post-admin-row"><div><strong>${escapeHtml(post.author?.nickname || '匿名')} ${post.author?.role === 'ai' ? '<span class="ai-badge">AI</span>' : ''}</strong><small>${escapeHtml(post.content).slice(0, 90)} · ${formatTime(post.createTime)}</small></div><div><button class="secondary inline" data-admin-pin="${post.id}" data-pinned="${post.pinned ? 1 : 0}">${post.pinned ? '取消置顶' : '置顶'}</button><button class="danger-button" data-admin-delete="${post.id}">下架</button></div></article>`).join('') || '<p class="empty">没有帖子记录。</p>';
  $('#admin-post-list').querySelectorAll('[data-admin-pin]').forEach(button => button.addEventListener('click', context.guardEvent(async () => { const result = await api(`/api/admin/posts/${button.dataset.adminPin}/pin`, { method:'PATCH', body:JSON.stringify({ pinned:button.dataset.pinned !== '1' }) }); showNotice(result.message); loadAdminPosts(); })));
  $('#admin-post-list').querySelectorAll('[data-admin-delete]').forEach(button => button.addEventListener('click', context.guardEvent(async () => { if (!confirm('确定下架这篇帖子吗？')) return; const result = await api(`/api/admin/posts/${button.dataset.adminDelete}`, { method:'DELETE' }); showNotice(result.message); loadAdminPosts(); })));

  } catch(error) { if(!context.isCancelled(error))throw error; }
}
async function loadAdminAi() {
  try {
  const result = await api('/api/admin/ai/settings');
  $('#admin-theme-form [name="holidayTheme"]').value = result.data.holidayTheme || '';
  $('#admin-agent-select').innerHTML = result.data.agents.map(agent => `<option value="${agent.id}">${escapeHtml(agent.name)}</option>`).join('');
  $('#admin-agent-editor').innerHTML = result.data.agents.map(agent => `<form class="settings-form agent-editor" data-agent-editor="${agent.id}"><h3>${escapeHtml(agent.name)}资料</h3><textarea name="persona" rows="3">${escapeHtml(agent.persona)}</textarea><input name="avatar" value="${escapeHtml(agent.avatar || '')}" placeholder="头像链接" /><button class="secondary inline">保存智能体</button></form>`).join('');
  $('#admin-agent-editor').querySelectorAll('[data-agent-editor]').forEach(form => form.addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); const result = await api(`/api/admin/ai/agents/${form.dataset.agentEditor}`, { method:'PUT', body:JSON.stringify(Object.fromEntries(new FormData(form))) }); showNotice(result.message); loadAdminAi(); })));

  } catch(error) { if(!context.isCancelled(error))throw error; }
}

function go(view) {
  if(context.disposed())return;
  if (view === 'admin' && current?.role !== 'admin') return showNotice('仅管理员可访问', 'error');
  const previousView = activeView;
  const restoreHome = view === 'home' && previousView === 'detail' && detailOriginView === 'home' && $('#feed').childElementCount > 0;
  if (previousView === 'home' && view !== 'home') homeScrollY = window.scrollY;
  if (view === 'detail' && previousView !== 'detail') detailOriginView = previousView;
  window.roomVoice?.leaveIfNavigating(view);
  if (view !== 'room') window.roomFeature?.leaveRoom();
  document.querySelectorAll('.view').forEach(element => element.classList.toggle('hidden', element.id !== `view-${view}`));
  document.querySelectorAll('.nav-link').forEach(element => element.classList.toggle('active', element.dataset.view === view));
  activeView = view; context.onView(view);
  if (view === 'home') {
    feedMode = 'home';
    if (restoreHome) requestAnimationFrame(() => window.scrollTo(0, homeScrollY));
    else { loadTags(); loadFeed(true); window.roomFeature?.loadHomeRooms(); }
  }
  if (view === 'rooms') window.roomFeature?.loadRooms();
  if (view === 'mine') loadList('mine');
  if (view === 'favorites') loadList('favorite');
  if (view === 'coins'){loadCoins();loadRoomIncome();}
  if (view === 'notifications') loadNotifications();
  if (view === 'tags') loadTags();
  if (view === 'profile') fillProfile();
  if (view === 'ai') loadAi();
  if (view === 'admin') loadAdmin();
  if (view !== 'detail') detailOriginView = null;
}
async function fillProfile() {
  try { const result = await api('/api/user/profile'); current = result.data; $('#profile-username').value = current.username; $('#profile-form [name="nickname"]').value = current.nickname || ''; $('#profile-form [name="avatar"]').value = mediaInputUrl(current.avatar); $('#profile-form [name="email"]').value = current.email || ''; const target = $('#profile-avatar'); target.innerHTML = current.avatar ? `<img src="${escapeHtml(current.avatar)}" alt="" />` : escapeHtml((current.nickname || current.username || '墨').slice(0, 1)); $('#profile-meta').textContent = `注册于 ${formatTime(current.createTime)} · ${current.role === 'admin' ? '管理员' : '社区用户'}`;
  } catch(error) { if(!context.isCancelled(error))throw error; }
}
async function bootApp(user) { current = user; showApp(); setProfileEntry(user); $('#admin-link').classList.toggle('hidden', user.role !== 'admin');await api('/api/media-session',{method:'POST',body:'{}'}).catch(()=>{});if(context.disposed())return;refreshCoinBalance();refreshNotificationBadge(); go(context.initialView || 'home'); context.onReady(); }

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button)); $('#login-form').classList.toggle('hidden', button.dataset.tab !== 'login'); $('#register-form').classList.toggle('hidden', button.dataset.tab !== 'register'); }));
$('#register-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); try { const result = await api('/api/user/register', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.target))) }); showNotice(result.message); document.querySelector('[data-tab="login"]').click(); event.target.reset(); } catch (error) { showNotice(error.message, 'error'); } }));
$('#login-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); try { const result = await api('/api/user/login', { method:'POST', body:JSON.stringify(Object.fromEntries(new FormData(event.target))) }); token = result.data.token; localStorage.setItem('guohua_token', token); bootApp(result.data.user); showNotice(result.message); } catch (error) { showNotice(error.message, 'error'); } }));
$('#profile-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); try { const result = await api('/api/user/profile', { method:'PUT', body:JSON.stringify(Object.fromEntries(new FormData(event.target))) }); current = result.data; setProfileEntry(current); showNotice(result.message); fillProfile(); } catch (error) { showNotice(error.message, 'error'); } }));
$('#post-form').addEventListener('submit', context.guardEvent(async event => {
  event.preventDefault();
  const form = event.target; const button = $('#publish-button'); const status = $('#publish-status');
  const imageFiles = [...$('#post-image-files').files]; const audioFile = $('#post-audio-file').files[0]; const videoFile = $('#post-video-file').files[0];
  const data = Object.fromEntries(new FormData(form)); const linkedImages = data.images.split(/[,，\n]+/).map(value => value.trim()).filter(Boolean);
  if(context.galleryReferenceId?.())data.galleryArtworkId=context.galleryReferenceId();
  if(quotedPostDraft)data.quotedPostId=quotedPostDraft.id;
  if (imageFiles.length + linkedImages.length > 9) return showNotice('图片总数不能超过 9 张', 'error');
  data.tags = data.tags.split(/[,，#\s]+/).map(value => value.trim()).filter(Boolean);
  button.disabled = true; button.textContent = '上传并发布中…';
  try {
    const uploadedImages = [];
    for (let index = 0; index < imageFiles.length; index += 1) { status.textContent = `正在上传图片 ${index + 1}/${imageFiles.length}…`; uploadedImages.push(await uploadFile(imageFiles[index], 'image')); }
    data.images = [...linkedImages, ...uploadedImages];
    if (audioFile) { status.textContent = '正在上传音频…'; data.audio = await uploadFile(audioFile, 'audio'); }
    if (videoFile) { status.textContent = '正在上传视频…'; data.video = await uploadFile(videoFile, 'video'); }
    status.textContent = '正在发布帖子…';
    const result = await api('/api/posts', { method:'POST', body:JSON.stringify(data) });
    context.onPublished?.();showNotice(result.message); form.reset();quotedPostDraft=null;renderQuoteCompose(); renderUploadSelection(); status.textContent = '图片 10MB/张，音频 30MB，视频 100MB。'; renderDetail({ post:result.data, comments:[] }); go('detail');
  } catch (error) { showNotice(error.message, 'error'); status.textContent = '上传或发布失败，请检查文件后重试。'; }
  finally { button.disabled = false; button.textContent = '发布帖子'; }
}));
['#post-image-files','#post-audio-file','#post-video-file'].forEach(selector => $(selector).addEventListener('change', renderUploadSelection));
$('#chat-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); if (!activeAgentId) return showNotice('请先选择诗人', 'error'); const data = Object.fromEntries(new FormData(event.target)); const button = event.target.querySelector('button'); button.disabled = true; button.textContent = '诗人思索中…'; try { const result = await api(`/api/ai/agents/${activeAgentId}/chat`, { method:'POST', headers:aiCredentialHeaders(), body:JSON.stringify(data) }); event.target.reset(); if (result.data.fallback) showNotice(result.message, 'error'); await selectAgent(activeAgentId); } catch (error) { showNotice(error.message, 'error'); } finally { button.disabled = false; button.textContent = '发送'; } }));
$('#ai-test-connection').addEventListener('click', context.guardEvent(async () => { const status = $('#ai-connection-status'); const button = $('#ai-test-connection'); const headers = aiCredentialHeaders(); if (!headers['X-DeepSeek-Key']) { status.textContent = '请先输入 API Key'; status.className = 'muted error-text'; return; } button.disabled = true; button.textContent = '测试中…'; status.textContent = ''; try { const result = await api('/api/ai/test', { method:'POST', headers }); status.textContent = `${result.message} · ${result.data.model}`; status.className = 'muted success-text'; } catch (error) { status.textContent = error.message; status.className = 'muted error-text'; } finally { button.disabled = false; button.textContent = '测试连接'; } }));
$('#ai-clear-key').addEventListener('click', () => { sessionDeepSeekKey = ''; $('#deepseek-key').value = ''; $('#ai-connection-status').textContent = '已清除'; $('#ai-connection-status').className = 'muted'; });
$('#admin-theme-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); const result = await api('/api/admin/ai/settings', { method:'PUT', body:JSON.stringify(Object.fromEntries(new FormData(event.target))) }); showNotice(result.message); }));
$('#admin-ai-post-form').addEventListener('submit', context.guardEvent(async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); data.tags = data.tags.split(/[,，#\s]+/).filter(Boolean); try { const result = await api('/api/admin/ai/publish', { method:'POST', body:JSON.stringify(data) }); showNotice(result.message); event.target.reset(); loadAdminAi(); } catch (error) { showNotice(error.message, 'error'); } }));
document.querySelectorAll('[data-view]').forEach(element => element.addEventListener('click', () => go(element.dataset.view)));
document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-admin-tab]').forEach(tab => tab.classList.toggle('active', tab === button)); ['users','posts','ai'].forEach(tab => $(`#admin-${tab}`).classList.toggle('hidden', tab !== button.dataset.adminTab)); }));
$('#profile-entry').addEventListener('click', () => go('profile'));
document.querySelectorAll('[data-coin-amount]').forEach(button=>button.addEventListener('click',()=>contributeCoins(Number(button.dataset.coinAmount))));
$('#mark-notifications-read').addEventListener('click',context.guardEvent(async()=>{try{await api('/api/notifications/read',{method:'POST',body:'{}'});showNotice('通知已全部标为已读');loadNotifications();}catch(error){showNotice(error.message,'error');}}));
$('#logout').addEventListener('click', context.guardEvent(async () => { window.roomVoice?.leave();window.roomFeature?.leaveRoom();try { await api('/api/user/logout', { method:'POST' }); } catch {} localStorage.removeItem('guohua_token'); token = null; current = null; showAuth(); showNotice('已退出登录'); }));
$('#load-more').addEventListener('click', () => { feedPage += 1; loadFeed(); });
$('#search-input').addEventListener('input', () => { clearTimeout(window.searchTimer); window.searchTimer = setTimeout(() => loadFeed(true), 300); });
$('#sort-select').addEventListener('change', () => loadFeed(true));
$('#admin-user-refresh').addEventListener('click', loadAdminUsers);
$('#admin-post-refresh').addEventListener('click', loadAdminPosts);

if (token) api('/api/user/profile').then(result => bootApp(result.data)).catch(error => showNotice(error.message,'error')); else showAuth();

window.communityApp = {
  api,
  avatar,
  escapeHtml,
  formatTime,
  go,
  showNotice,
  getCurrent: () => current,
  openDetail,
  getQuote:()=>quotedPostDraft,
  setQuote:value=>{quotedPostDraft=value&&Number.isSafeInteger(value.id)&&value.id>0?value:null;renderQuoteCompose();},
  getToken: () => token
};

}
