// Adapted from 国画社区系统2.0; see docs/community-v2-reference.md.
export function mountVoice(context) {
const {document,window,fetch,localStorage,location,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame} = context;
(() => {
  const app = window.communityApp;
  const voice = {
    room: null, socket: null, selfId: null, peers: new Map(), connections: new Map(),
    stream: null, starting: false, wanted: false, limit: 6, listening: false,
    pendingCandidates: new Map(), promptWanted: false, meter: null, micEpoch: 0
  };
  const button = document.createElement('button');
  button.id = 'room-voice-action';
  button.className = 'share-action hidden';
  button.type = 'button';
  button.setAttribute('aria-label', '开启麦克风');
  document.querySelector('#room-share-action').insertAdjacentElement('afterend', button);
  const meter = document.createElement('div');
  meter.id = 'room-voice-meter';
  meter.className = 'room-voice-meter hidden';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', '我的麦克风音量');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  meter.title = '我的麦克风音量（仅自己可见）';
  meter.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2" width="6" height="11" rx="3"></rect><path d="M4 9a6 6 0 0 0 12 0M10 15v3M7 18h6"></path></svg><i></i><i></i><i></i><i></i><i></i>';
  button.insertAdjacentElement('afterend', meter);
  const meterBars = [...meter.querySelectorAll('i')];
  const status = document.createElement('div');
  status.id = 'room-voice-status';
  status.className = 'room-voice-status hidden';
  document.querySelector('#room-share-banner').insertAdjacentElement('afterend', status);
  const audioRoot = document.createElement('div');
  audioRoot.id = 'room-voice-audio';
  audioRoot.hidden = true;
  document.body.append(audioRoot);
  const dialog = document.createElement('dialog');
  dialog.id = 'room-voice-prompt';
  dialog.className = 'room-voice-prompt';
  dialog.innerHTML = '<h3>加入房间语音？</h3><p>你可以收听其他成员，麦克风默认关闭。开启后也可以在房间内随时关闭。</p><div><button type="button" id="room-voice-later" class="secondary inline">暂不开麦</button><button type="button" id="room-voice-now" class="primary compact">开启麦克风</button></div>';
  document.body.append(dialog);

  const myId = () => app.getCurrent()?.id;
  const live = () => !context.disposed();
  const canSpeak = () => live() && voice.room?.status === 'active' && ['owner', 'member'].includes(voice.room?.myMembership?.role) && !(voice.room?.myMembership?.mutedUntil && new Date(voice.room.myMembership.mutedUntil).getTime() > Date.now());
  const send = payload => { if (live() && voice.socket?.readyState === WebSocket.OPEN) voice.socket.send(JSON.stringify(payload)); };
  const speakerCount = () => [...voice.peers.values()].filter(peer => peer.speaking).length + Number(Boolean(voice.stream));
  const isSpeakingUser = userId => Boolean(voice.room?.id && ((Number(userId) === myId() && voice.stream) || [...voice.peers.values()].some(peer => peer.userId === Number(userId) && peer.speaking)));
  function render() {
    const inRoom = Boolean(voice.room?.id && voice.room.status === 'active');
    button.classList.toggle('hidden', !inRoom);
    meter.classList.toggle('hidden', !inRoom || !voice.stream);
    status.classList.toggle('hidden', !inRoom);
    if (!inRoom) { window.roomFeature?.renderVoiceMembers?.(); return; }
    const visitor = voice.room.myMembership?.role === 'visitor';
    const speaking = Boolean(voice.stream);
    button.textContent = voice.starting ? '正在连接麦克风…' : speaking ? '关闭麦克风' : visitor ? '访客仅可收听' : '开启麦克风';
    button.disabled = voice.starting || visitor || (!speaking && (!canSpeak() || !voice.listening));
    button.classList.toggle('active', speaking);
    button.setAttribute('aria-label', speaking ? '关闭麦克风' : '开启麦克风');
    const names = [...voice.peers.values()].filter(peer => peer.speaking).map(peer => voice.roomMembers?.find(item => item.user.id === peer.userId)?.user.nickname || `用户${peer.userId}`);
    if (voice.stream) names.unshift(app.getCurrent()?.nickname || '我');
    status.textContent = `语音：${voice.listening ? '已加入收听' : '连接中'} · ${speakerCount()}/${voice.limit} 人开麦${names.length ? ' · '+names.join('、') : ''}${visitor ? ' · 访客不可开麦' : ''}`;
    window.roomFeature?.renderVoiceMembers?.();
  }
  function closeConnection(peerId, expected) {
    const entry = voice.connections.get(peerId);
    if (!entry || expected && entry !== expected) return;
    voice.connections.delete(peerId);
    entry.pc.ontrack=null;entry.pc.onicecandidate=null;entry.pc.onconnectionstatechange=null;
    entry.pc.close();
    if(entry.audio){entry.audio.pause();entry.audio.srcObject?.getTracks().forEach(track=>track.stop());entry.audio.srcObject=null;entry.audio.removeAttribute('src');entry.audio.load();entry.audio.remove();}
  }
  function closeConnections() { for (const id of [...voice.connections.keys()]) closeConnection(id); }
  function setMeterLevel(value) {
    const level = Math.max(0, Math.min(100, Math.round(value)));
    meter.setAttribute('aria-valuenow', String(level));
    meterBars.forEach((bar, index) => bar.classList.toggle('lit', level >= [8, 20, 35, 55, 75][index]));
  }
  function stopMeter() {
    const active = voice.meter;
    voice.meter = null;
    if (active) {
      cancelAnimationFrame(active.frame);
      active.source.disconnect();
      active.context.close().catch(() => {});
    }
    setMeterLevel(0);
  }
  function startMeter(stream) {
    if(!live())return;
    stopMeter();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) { meter.title = '当前浏览器不支持音量监测'; return; }
    let context;
    try {
      context = new AudioContextClass();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const active = {context, source, frame:0, smooth:0};
      voice.meter = active;
      meter.title = '我的麦克风音量（仅自己可见）';
      context.resume().catch(() => {});
      function update() {
        if (voice.meter !== active) return;
        analyser.getByteTimeDomainData(samples);
        let power = 0;
        for (const sample of samples) {const amplitude = (sample - 128) / 128; power += amplitude * amplitude;}
        const level = Math.min(100, Math.sqrt(power / samples.length) * 1600);
        active.smooth = active.smooth * .65 + level * .35;
        setMeterLevel(active.smooth);
        active.frame = requestAnimationFrame(update);
      }
      update();
    } catch {
      stopMeter();
      if (context && context.state !== 'closed') context.close().catch(() => {});
      meter.title = '无法读取麦克风音量';
    }
  }
  function stopMic({notify=true}={}) {
    voice.micEpoch += 1;
    stopMeter();
    if (voice.stream) { voice.stream.getTracks().forEach(track => track.stop()); voice.stream = null; }
    voice.wanted = false; voice.starting = false;
    if (notify) send({type:'voice.stop'});
    closeConnections(); render();
  }
  function leave() {
    if (voice.listening) send({type:'voice.leave'});
    stopMic({notify:false}); voice.listening = false; voice.selfId = null; voice.peers.clear();
    voice.room = null; voice.roomMembers = null; voice.socket = null; voice.pendingCandidates.clear(); voice.promptWanted = false; audioRoot.replaceChildren();
    if (dialog.open) dialog.close(); render();
  }
  function createConnection(peerId) {
    if(!live()||!voice.listening)return null;
    if (voice.connections.has(peerId)) return voice.connections.get(peerId);
    const remote = voice.peers.get(peerId);
    if (!remote || !remote.speaking && !voice.stream || typeof RTCPeerConnection === 'undefined') return null;
    const configured = Array.isArray(window.ROOM_VOICE_ICE_SERVERS) ? window.ROOM_VOICE_ICE_SERVERS : [{urls:'stun:stun.l.google.com:19302'}];
    const pc = new RTCPeerConnection({iceServers:configured});
    const entry = {pc, audio:null, candidates:[]};
    voice.connections.set(peerId, entry);
    if (voice.stream) voice.stream.getTracks().forEach(track => pc.addTrack(track,voice.stream));
    else pc.addTransceiver('audio',{direction:'recvonly'});
    pc.onicecandidate = event => { if (event.candidate && voice.connections.get(peerId)===entry) send({type:'voice.signal',to:peerId,signal:{type:'candidate',candidate:event.candidate.toJSON()}}); };
    pc.ontrack = event => {
      if(!live()||!voice.listening||voice.connections.get(peerId)!==entry){event.track.stop();return;}
      if (!entry.audio) {entry.audio = document.createElement('audio');entry.audio.autoplay = true;entry.audio.playsInline = true;audioRoot.append(entry.audio);}
      entry.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      entry.audio.play().catch(() => { status.textContent = '浏览器阻止了自动播放。点击此处收听房间语音。'; status.classList.add('needs-play'); });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {closeConnection(peerId); if (voice.peers.has(peerId) && (voice.stream || remote.speaking)) setTimeout(() => offerTo(peerId), 1200);}
    };
    return entry;
  }
  async function offerTo(peerId) {
    const remote = voice.peers.get(peerId);
    if (!remote || !voice.selfId || !voice.listening || (!remote.speaking && !voice.stream)) return;
    if (voice.connections.has(peerId)) return;
    const selfSpeaking = Boolean(voice.stream);
    if (!selfSpeaking || remote.speaking && voice.selfId > peerId) return;
    const entry = createConnection(peerId); if (!entry) return;
    try {await entry.pc.setLocalDescription(await entry.pc.createOffer());if(live()&&voice.connections.get(peerId)===entry)send({type:'voice.signal',to:peerId,signal:{type:'offer',sdp:entry.pc.localDescription.sdp}});}
    catch {closeConnection(peerId,entry);}
  }
  async function handleSignal(data) {
    const {from,signal} = data;
    if (!live() || !voice.peers.has(from) || !voice.listening) return;
    let pendingEntry;
    try {
      if (signal.type === 'offer') {
        closeConnection(from);
        const entry=pendingEntry=createConnection(from);if(!entry)return;
        await entry.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
        if(!live()||voice.connections.get(from)!==entry)return;
        await entry.pc.setLocalDescription(await entry.pc.createAnswer());
        if(!live()||voice.connections.get(from)!==entry)return;
        send({type:'voice.signal',to:from,signal:{type:'answer',sdp:entry.pc.localDescription.sdp}});
        for(const candidate of [...(voice.pendingCandidates.get(from)||[]),...entry.candidates])await entry.pc.addIceCandidate(candidate);
        voice.pendingCandidates.delete(from);
        entry.candidates=[];
      } else if (signal.type === 'answer') {
        const entry=pendingEntry=voice.connections.get(from);if(!entry)return;
        await entry.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
        if(!live()||voice.connections.get(from)!==entry)return;
        for(const candidate of entry.candidates)await entry.pc.addIceCandidate(candidate);
        entry.candidates=[];
      } else if (signal.type === 'candidate') {
        const entry=pendingEntry=voice.connections.get(from);
        if(entry?.pc.remoteDescription)await entry.pc.addIceCandidate(signal.candidate);
        else if(entry)entry.candidates.push(signal.candidate);
        else {const candidates=voice.pendingCandidates.get(from)||[];if(candidates.length<50)candidates.push(signal.candidate);voice.pendingCandidates.set(from,candidates);}
      }
    } catch {if(pendingEntry)closeConnection(from,pendingEntry);}
  }
  async function startMic() {
    if (voice.stream || voice.starting || !canSpeak()) return;
    if (!voice.listening) return app.showNotice('语音仍在连接，请稍后重试','error');
    if (speakerCount() >= voice.limit) return app.showNotice('当前已有 6 人开麦，请稍后再试','error');
    if (!navigator.mediaDevices?.getUserMedia) return app.showNotice('当前环境不支持麦克风，请使用 localhost 或 HTTPS 页面','error');
    voice.starting = true;render();
    const micEpoch=++voice.micEpoch;
    try {
      const roomId=voice.room.id;
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(!live()||voice.micEpoch!==micEpoch||voice.room?.id!==roomId||!canSpeak()||!voice.listening){stream.getTracks().forEach(track=>track.stop());return;}
      voice.stream=stream;voice.wanted=true;
      startMeter(stream);
      stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(voice.stream===stream)stopMic();},{once:true}));
      send({type:'voice.start'});
    } catch(error) {
      if(!live()||voice.micEpoch!==micEpoch)return;
      app.showNotice(error.name==='NotAllowedError'?'麦克风授权被拒绝，可在浏览器设置中允许后重试':`无法开启麦克风：${error.message}`,'error');
    } finally {if(live()&&voice.micEpoch===micEpoch){voice.starting=false;render();}}
  }
  function onEvent(event) {
    if(!live())return;
    const {eventType,data}=event;
    if(eventType==='room.subscribed'){send({type:'voice.join'});return;}
    if(eventType==='voice.roster'){
      voice.selfId=data.selfId;voice.limit=data.limit;voice.peers=new Map(data.peers.filter(peer=>peer.peerId!==data.selfId).map(peer=>[peer.peerId,peer]));voice.listening=true;
      for(const peer of voice.peers.values())offerTo(peer.peerId);
      if(voice.promptWanted){voice.promptWanted=false;if(canSpeak()&&!dialog.open)dialog.showModal();}
    } else if(eventType==='voice.joined'){
      if(data.peerId!==voice.selfId){voice.peers.set(data.peerId,data);offerTo(data.peerId);}
    } else if(eventType==='voice.left'){
      voice.peers.delete(data.peerId);closeConnection(data.peerId);
    } else if(eventType==='voice.updated'){
      if(data.peerId===voice.selfId){if(!data.speaking&&voice.stream)stopMic({notify:false});closeConnections();for(const peer of voice.peers.values())offerTo(peer.peerId);}
      else {voice.peers.set(data.peerId,data);closeConnection(data.peerId);offerTo(data.peerId);}
    } else if(eventType==='voice.signal')handleSignal(data);
    else if(eventType==='voice.forced_stop'){stopMic({notify:false});app.showNotice(data.reason==='owner_stopped'?'房主已关闭你的麦克风；如需发言可再次开启':'房主已禁言或调整了你的权限，麦克风已关闭','error');}
    else if(eventType==='voice.room_ended'){voice.listening=false;leave();return;}
    else if(eventType==='voice.error'){if(voice.stream)stopMic({notify:false});app.showNotice(data.message,'error');}
    render();
  }
  function attach(room,socket) {
    if(!live()){socket.close(1000,'离开房间');return;}
    if(voice.socket!==socket){leave();voice.room=room;voice.socket=socket;socket.addEventListener('message',event=>{if(voice.socket!==socket)return;try{onEvent(JSON.parse(event.data));}catch{}});socket.addEventListener('close',()=>{if(voice.socket===socket){stopMic({notify:false});voice.listening=false;voice.selfId=null;voice.peers.clear();render();}});}
    else voice.room=room;
    render();
  }
  function updateRoom(room,members) {if(voice.room?.id!==room?.id)return;voice.room=room;voice.roomMembers=members;if(!canSpeak()&&voice.stream)stopMic();render();}
  function promptOnEntry() {if(!canSpeak()||voice.room?.status!=='active')return;if(voice.listening){if(!dialog.open)dialog.showModal();}else voice.promptWanted=true;}
  button.addEventListener('click',()=>voice.stream?stopMic():startMic());
  dialog.querySelector('#room-voice-later').addEventListener('click',()=>dialog.close());
  dialog.querySelector('#room-voice-now').addEventListener('click',()=>{dialog.close();startMic();});
  status.addEventListener('click',()=>{if(status.classList.contains('needs-play')){audioRoot.querySelectorAll('audio').forEach(audio=>audio.play().catch(()=>{}));status.classList.remove('needs-play');render();}});
  window.addEventListener('pagehide',leave);
  window.roomVoice={attach,updateRoom,promptOnEntry,leave,isSpeakingUser,leaveIfNavigating:view=>{if(view!=='room'&&voice.room)leave();}};
})();

}
