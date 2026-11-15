"""Runtime journal and disposal regressions; all HTTP/WS activity is intercepted.

Requires Python Playwright and Chromium. No running app, actual account,
database, provider, microphone permission, or remote voice connection is used.
  python tests/community-v2-runtime.browser.py --output /tmp/community-v2-runtime
Set COMMUNITY_CHROMIUM_EXECUTABLE for an existing Chromium installation.
"""
from pathlib import Path
from urllib.parse import urlparse
import argparse
import base64
import hashlib
import io
import json
import os
import wave

from playwright.sync_api import sync_playwright, expect


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1] / 'public/community-v2'
assets = {path.name: path.read_bytes() for path in root.iterdir() if path.is_file()}
report = {'boundary': 'Every HTTP request intercepted; WebSocket, microphone and all identities are disposable browser fixtures.',
          'source_sha256': {name: hashlib.sha256(assets[name]).hexdigest() for name in ['runtime.mjs', 'app.mjs', 'room-voice.mjs']}, 'cases': []}
JOURNAL = 'artlive.community.reference.operations.v1:42'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lR8AAAAASUVORK5CYII=')
buffer = io.BytesIO()
with wave.open(buffer, 'wb') as writer:
    writer.setnchannels(1)
    writer.setsampwidth(1)
    writer.setframerate(8000)
    writer.writeframes(b'\x80' * 80000)
SILENT_AUDIO = 'data:audio/wav;base64,' + base64.b64encode(buffer.getvalue()).decode()

SOCKET_MIC_FIXTURE = """
window.__reviewSockets=[];window.__reviewMicRequests=[];window.__reviewTracks=[];
class ReviewSocket extends EventTarget {
 static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
 constructor(url){super();this.url=url;this.readyState=0;this.sent=[];window.__reviewSockets.push(this);queueMicrotask(()=>{if(this.readyState===0){this.readyState=1;this.dispatchEvent(new Event('open'));}});}
 send(raw){const message=JSON.parse(raw);this.sent.push(message);if(message.type==='room.subscribe')queueMicrotask(()=>this.emit('room.subscribed',{}));if(message.type==='voice.join')queueMicrotask(()=>this.emit('voice.roster',{selfId:'review-self',limit:6,peers:[]}));}
 emit(eventType,data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({eventType,data})}));}
 close(code=1000){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new CloseEvent('close',{code}));}
}
window.WebSocket=ReviewSocket;
const replaceState=history.replaceState.bind(history);history.replaceState=(...args)=>{window.__reviewNavigationCount=(window.__reviewNavigationCount||0)+1;return replaceState(...args);};
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>window.__reviewMicRequests.push(()=>{
 const track=new EventTarget();track.stops=0;track.stop=()=>{track.stops++;};window.__reviewTracks.push(track);
 resolve({getTracks:()=>[track],getAudioTracks:()=>[track]});
}))}});
"""


def user(actor=42):
    return {'id': actor, 'role': 'user', 'username': 'review' + str(actor), 'nickname': {42: '甲账号', 43: '乙账号'}.get(actor, '隔离房主'), 'avatar': '', 'createTime': '2026-11-12 00:00:00'}


def room():
    return {'id': 'A', 'name': '隔离房间 A', 'description': '', 'visibility': 'public', 'status': 'active', 'entryPrice': 0,
            'onlineCount': 1, 'memberCount': 1, 'memberLimit': 10, 'owner': user(99), 'myMembership': {'role': 'member', 'status': 'active'}, 'currentSession': None}


class Fixture:
    def __init__(self, page):
        self.page = page
        self.calls = []
        self.errors = []
        self.operations = {}
        self.hold = set()
        self.pending = {}
        self.truncate_post = False
        self.pending_resolution = False
        self.bad_tags = False
        self.with_audio = False
        self.artwork_size = None
        self.share_presenter = None
        self.snapshot_failures = 0

    def envelope(self, data):
        return {'code': 200, 'message': 'ok', 'data': data}

    def reply(self, route, data):
        route.fulfill(status=200, content_type='application/json', body=json.dumps(self.envelope(data), ensure_ascii=False))

    def post(self, content='隔离内容', actor=42):
        return {'id': 7, 'author': user(actor), 'content': content, 'images': [], 'tags': [], 'audio': SILENT_AUDIO if self.with_audio else '',
                'video': '', 'likeCount': 0, 'commentCount': 0, 'coinCount': 0, 'createTime': '2026-11-12 00:00:00'}

    def route(self, route):
        request = route.request
        path = urlparse(request.url).path
        if path == '/':
            return route.fulfill(content_type='text/html', body='<div id="runtime-host"></div>')
        if path.startswith('/community-v2/'):
            name = path.rsplit('/', 1)[1]
            if name in assets:
                return route.fulfill(content_type='text/javascript' if name.endswith('.mjs') else 'text/css' if name.endswith('.css') else 'text/html', body=assets[name])
        if path == '/fixture-artwork.svg':
            w,h=self.artwork_size or (1000,2000)
            return route.fulfill(content_type='image/svg+xml',body=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="100%" height="100%" fill="#eee0c0"/></svg>')
        local = path.removeprefix('/api/community/v2')
        method = request.method
        self.calls.append({'method': method, 'path': local, 'authorization': request.headers.get('authorization'), 'request_id': request.headers.get('x-request-id')})
        if local == '/api/posts' and method == 'POST':
            payload = json.loads(request.post_data or '{}')
            self.operations[request.headers['x-request-id']] = self.envelope(self.post(payload.get('content', '')))
        if local in self.hold:
            self.pending[local] = route
            self.page.evaluate('(path)=>{window.__reviewHeld||=[];window.__reviewHeld.push(path);}', local)
            return
        if local == '/api/user/profile':
            return self.reply(route, user(43 if request.headers.get('authorization') == 'Bearer REVIEW_2' else 42))
        if local == '/api/media-session':
            return self.reply(route, {})
        if local == '/api/coins/wallet':
            return self.reply(route, {'balance': 0})
        if local == '/api/notifications':
            return self.reply(route, {'unread': 0, 'items': []})
        if local == '/api/tags':
            return self.reply(route, None if self.bad_tags else [])
        if local == '/api/posts' and method == 'GET':
            return self.reply(route, {'items': [], 'hasMore': False})
        if local == '/api/posts' and method == 'POST':
            if self.truncate_post:
                return route.fulfill(status=200, content_type='application/json', body='{"code":200,"data":')
            return self.reply(route, self.post(json.loads(request.post_data or '{}').get('content', '')))
        if local == '/api/posts/7':
            return self.reply(route, {'post': self.post(), 'comments': []})
        if local.startswith('/api/operations/'):
            request_id = local.rsplit('/', 1)[1]
            if self.pending_resolution or request_id not in self.operations:
                return self.reply(route, {'state': 'NOT_OBSERVED'})
            return self.reply(route, {'state': 'COMMITTED', 'status': 200, 'result': self.operations[request_id]})
        if local == '/api/uploads':
            return self.reply(route, {'url': '/uploads/isolated-review.png'})
        if local == '/api/v2/rooms/public':
            return self.reply(route, {'items': [room()]})
        if local in ['/api/v2/rooms/A', '/api/v2/rooms/A/join']:
            return self.reply(route, room())
        if local == '/api/v2/rooms/A/snapshot':
            if self.snapshot_failures:
                self.snapshot_failures-=1
                return route.fulfill(status=503,content_type='application/json',body=json.dumps({'code':503,'message':'Temporary fixture failure'}))
            value={'room': room(), 'members': [], 'annotations': [], 'drawings': [], 'messages': []}
            if self.artwork_size:
                w,h=self.artwork_size
                value['room']['currentSession']={'id':'S','title':'Fixture artwork','asset':{'width':w,'height':h,'url':'/fixture-artwork.svg'}}
                value['annotations']=[{'id':'other','sessionId':'S','author':user(43),'shapeType':'rectangle','geometry':{'x':.05,'y':.05,'width':.1,'height':.1},'content':'Other member annotation','status':'visible','createdAt':'2026-11-15 00:00:00'}]
                if self.share_presenter:
                    value['share']={'roomId':'A','presenterId':self.share_presenter,'sessionId':'S','selectedAnnotationId':None if self.share_presenter==42 else 'other','strokes':[],'viewport':{'scale':1,'panX':0,'panY':0}}
            return self.reply(route,value)
        if local == '/api/rtc-config':
            return self.reply(route, {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}], 'relayAvailable': False})
        if local == '/api/ws-ticket':
            return self.reply(route, {'ticket': 'isolated-ticket'})
        raise AssertionError('Unexpected isolated request: ' + method + ' ' + request.url)

    def prepare(self, search=''):
        self.page.add_init_script(SOCKET_MIC_FIXTURE)
        self.page.route('**/*', self.route)
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto('http://127.0.0.1:39881/' + search)

    def mount(self, generation=1):
        navigation_count = self.page.evaluate('()=>window.__reviewNavigationCount||0')
        self.page.evaluate("""async generation=>{window.__reviewGeneration=generation;const module=await import('/community-v2/runtime.mjs');
         window.__reviewDispose=await module.mountCommunity(document.querySelector('#runtime-host'),{token:'REVIEW_'+generation,
         actorId:generation===1?'42':'43',isCurrent:()=>window.__reviewGeneration===generation,signOut:()=>{}});} """, generation)
        self.page.wait_for_function('(previous)=>window.__reviewNavigationCount>previous', arg=navigation_count)

    def compose(self):
        self.page.locator('#runtime-host .topbar [data-view="create"]').click()
        self.page.locator('#runtime-host #post-form textarea[name="content"]').fill('隔离发布，不连接真实服务器')

    def submit_failed(self):
        self.page.locator('#runtime-host #publish-button').click()
        expect(self.page.locator('#runtime-host #publish-status')).to_contain_text('上传或发布失败')

    def writes(self, path):
        return [item for item in self.calls if item['method'] == 'POST' and item['path'] == path]

    def journal(self):
        return self.page.evaluate('(key)=>sessionStorage.getItem(key)', JOURNAL)

    def flush(self):
        self.page.evaluate('async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}')

    def entered_room(self):
        self.page.locator('#runtime-host #home-room-grid [data-enter-room="A"]').click()
        expect(self.page.locator('#runtime-host #room-voice-prompt')).to_be_visible(timeout=10000)


with sync_playwright() as playwright:
    options = {'headless': True, 'args': ['--no-sandbox', '--no-proxy-server', '--autoplay-policy=no-user-gesture-required']}
    if os.environ.get('COMMUNITY_CHROMIUM_EXECUTABLE'):
        options['executable_path'] = os.environ['COMMUNITY_CHROMIUM_EXECUTABLE']
    browser = playwright.chromium.launch(**options)
    report['browser'] = browser.version
    try:
        def scenario(name, work, expected_error=False):
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, service_workers='block')
            page = context.new_page()
            page.set_default_timeout(10000)
            fixture = Fixture(page)
            try:
                work(fixture)
                fixture.flush()
                if not expected_error:
                    assert fixture.errors == [], fixture.errors
                else:
                    assert any("length" in error for error in fixture.errors), fixture.errors
                report['cases'].append({'name': name, 'pass': True, 'page_errors': fixture.errors, 'expected_error': expected_error})
                print('PASS ' + name, flush=True)
            except Exception:
                page.screenshot(path=str(args.output / (name + '-failure.png')), full_page=True)
                raise
            finally:
                page.evaluate('()=>window.__reviewDispose?.()')
                context.close()

        def truncated_success(fixture):
            fixture.truncate_post = True
            fixture.prepare()
            fixture.mount()
            fixture.compose()
            fixture.submit_failed()
            assert len(json.loads(fixture.journal())) == 1
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(fixture.page.locator('#runtime-host #detail .detail-content')).to_contain_text('隔离发布')
            assert len(fixture.writes('/api/posts')) == 1
            assert len([item for item in fixture.calls if item['path'].startswith('/api/operations/')]) == 1
            assert json.loads(fixture.journal()) == []

        def storage_refusal(fixture, method):
            fixture.prepare()
            fixture.page.evaluate("""method=>{const original=Storage.prototype[method];window.__restoreJournalStorage=()=>Storage.prototype[method]=original;
             Storage.prototype[method]=function(key,...args){if(key.startsWith('artlive.community.reference.operations.v1:'))throw new DOMException('isolated storage refusal','QuotaExceededError');return original.call(this,key,...args);};} """, method)
            fixture.mount()
            fixture.compose()
            fixture.submit_failed()
            assert fixture.writes('/api/posts') == []
            expect(fixture.page.locator('#runtime-host #notice')).to_contain_text('存储')
            fixture.page.evaluate('()=>window.__restoreJournalStorage()')
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(fixture.page.locator('#runtime-host #detail .detail-content')).to_contain_text('隔离发布')
            assert len(fixture.writes('/api/posts')) == 1

        def old_pending_survives(fixture):
            fixture.truncate_post = True
            fixture.prepare()
            fixture.mount()
            fixture.compose()
            fixture.submit_failed()
            fixture.page.evaluate("""key=>{const saved=JSON.parse(sessionStorage.getItem(key));saved[0][1].at=Date.now()-3*86400000;sessionStorage.setItem(key,JSON.stringify(saved));window.__reviewDispose();} """, JOURNAL)
            fixture.pending_resolution = True
            fixture.mount()
            fixture.compose()
            fixture.submit_failed()
            assert len(fixture.writes('/api/posts')) == 1
            assert len(json.loads(fixture.journal())) == 1
            fixture.pending_resolution = False
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(fixture.page.locator('#runtime-host #detail .detail-content')).to_contain_text('隔离发布')
            assert len(fixture.writes('/api/posts')) == 1

        def corrupt_journal(fixture):
            fixture.prepare()
            original = '[["POST /api/posts",{"id":"broken","signature":"","at":1}]]'
            fixture.page.evaluate('([key,value])=>sessionStorage.setItem(key,value)', [JOURNAL, original])
            fixture.mount()
            fixture.compose()
            fixture.submit_failed()
            assert fixture.writes('/api/posts') == []
            assert fixture.journal() == original
            expect(fixture.page.locator('#runtime-host #notice')).to_contain_text('原记录已保留')
            # An explicit repair allows recovery; the runtime never erases bad bytes.
            fixture.page.evaluate('(key)=>sessionStorage.setItem(key,"[]")', JOURNAL)
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(fixture.page.locator('#runtime-host #detail .detail-content')).to_contain_text('隔离发布')
            assert len(fixture.writes('/api/posts')) == 1

        def confirmed_receipt_storage_refusal(fixture):
            fixture.prepare()
            fixture.page.evaluate("""()=>{const original=Storage.prototype.setItem;window.__restoreJournalStorage=()=>Storage.prototype.setItem=original;
             Storage.prototype.setItem=function(key,value){if(key.startsWith('artlive.community.reference.operations.v1:')&&value==='[]')throw new DOMException('isolated completion refusal','QuotaExceededError');return original.call(this,key,value);};} """)
            fixture.mount()
            fixture.compose()
            fixture.submit_failed()
            assert len(fixture.writes('/api/posts')) == 1
            assert len(json.loads(fixture.journal())) == 1
            fixture.submit_failed()
            assert len(fixture.writes('/api/posts')) == 1
            fixture.page.evaluate('()=>window.__restoreJournalStorage()')
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(fixture.page.locator('#runtime-host #detail .detail-content')).to_contain_text('隔离发布')
            assert len(fixture.writes('/api/posts')) == 1

        def playback_cleanup(fixture):
            fixture.with_audio = True
            fixture.prepare('?post=7')
            fixture.mount()
            fixture.page.locator('#runtime-host #detail audio').wait_for()
            result = fixture.page.evaluate("""async()=>{const body=document.querySelector('#runtime-host').shadowRoot.querySelector('.reference-body');const audio=body.querySelector('audio');await audio.play();
             const ac=new AudioContext(),destination=ac.createMediaStreamDestination();await ac.resume();const video=document.createElement('video');video.srcObject=destination.stream;body.append(video);await video.play();
             const track=destination.stream.getTracks()[0];window.__reviewDispose();const value={audioPaused:audio.paused,audioSrc:audio.getAttribute('src'),videoPaused:video.paused,videoSrcObject:video.srcObject,trackState:track.readyState};await ac.close();return value;} """)
            assert result == {'audioPaused': True, 'audioSrc': None, 'videoPaused': True, 'videoSrcObject': None, 'trackState': 'ended'}, result

        def delayed_microphone(fixture):
            fixture.prepare()
            fixture.mount()
            fixture.entered_room()
            fixture.page.locator('#runtime-host #room-voice-now').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===1')
            fixture.page.evaluate('()=>{window.__reviewGeneration=2;window.__reviewDispose();window.__reviewMicRequests[0]();}')
            fixture.page.wait_for_function('()=>window.__reviewTracks[0]?.stops>0')
            assert fixture.page.evaluate("()=>window.__reviewSockets.flatMap(s=>s.sent).filter(m=>m.type==='voice.start').length") == 0

        def same_room_mic_reentry(fixture):
            fixture.prepare()
            fixture.page.evaluate('()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;}')
            fixture.mount()
            fixture.entered_room()
            fixture.page.locator('#runtime-host #room-voice-now').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===1')
            fixture.page.locator('#runtime-host .topbar .nav-link[data-view="home"]').click()
            fixture.entered_room()
            fixture.page.locator('#runtime-host #room-voice-now').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===2')
            fixture.page.evaluate('()=>window.__reviewMicRequests[0]()')
            fixture.page.wait_for_function('()=>window.__reviewTracks[0]?.stops>0')
            fixture.page.evaluate('()=>window.__reviewMicRequests[1]()')
            fixture.page.wait_for_function("()=>window.__reviewSockets.flatMap(s=>s.sent).some(m=>m.type==='voice.start')")
            assert fixture.page.evaluate('()=>window.__reviewTracks[1].stops') == 0
            fixture.page.evaluate('()=>window.__reviewDispose()')
            assert fixture.page.evaluate('()=>window.__reviewTracks[1].stops') == 1

        def cancel_reads(fixture):
            fixture.hold.add('/api/tags')
            fixture.prepare()
            fixture.mount()
            fixture.page.wait_for_function("()=>window.__reviewHeld?.includes('/api/tags')")
            fixture.page.evaluate('()=>{window.__reviewGeneration=2;window.__reviewDispose();}')
            fixture.reply(fixture.pending['/api/tags'], [])
            fixture.flush()
            assert fixture.errors == []

        def account_switch_upload(fixture):
            fixture.hold.add('/api/uploads')
            fixture.prepare()
            fixture.mount()
            fixture.compose()
            fixture.page.locator('#runtime-host #post-image-files').set_input_files([
                {'name': 'first.png', 'mimeType': 'image/png', 'buffer': PNG}, {'name': 'second.png', 'mimeType': 'image/png', 'buffer': PNG}])
            fixture.page.locator('#runtime-host #publish-button').click()
            fixture.page.wait_for_function("()=>window.__reviewHeld?.includes('/api/uploads')")
            fixture.page.evaluate('()=>{window.__reviewGeneration=2;window.__reviewDispose();}')
            fixture.mount(2)
            fixture.reply(fixture.pending['/api/uploads'], {'url': '/uploads/isolated-review.png'})
            fixture.flush()
            assert len(fixture.writes('/api/uploads')) == 1
            assert fixture.writes('/api/posts') == []
            assert len(json.loads(fixture.journal())) == 1
            expect(fixture.page.locator('#runtime-host #profile-entry')).to_have_text('乙')

        def late_cleanup_preserves_account(fixture):
            fixture.prepare()
            fixture.mount()
            fixture.page.evaluate('()=>{window.__reviewOldDispose=window.__reviewDispose;}')
            fixture.mount(2)
            fixture.page.evaluate('()=>window.__reviewOldDispose()')
            expect(fixture.page.locator('#runtime-host #profile-entry')).to_have_text('乙')
            expect(fixture.page.locator('#runtime-host #app-screen')).to_be_visible()

        def retired_poet_link(fixture):
            fixture.prepare('?view=ai')
            fixture.mount()
            expect(fixture.page.locator('#runtime-host #view-home')).to_be_visible()
            assert fixture.page.locator('#runtime-host [data-view="ai"], #runtime-host #view-ai, #runtime-host #admin-ai, #runtime-host #deepseek-key').count() == 0
            assert fixture.page.locator('#runtime-host #room-deepseek-key').count() == 1
            assert 'view=home' in fixture.page.url
            assert not any(call['path'].startswith(('/api/ai/', '/api/admin/ai/')) for call in fixture.calls)

        def navigation_returns_to_top(fixture):
            fixture.prepare()
            fixture.mount()
            fixture.page.evaluate('()=>{document.querySelector("#runtime-host").style.minHeight="3000px";window.scrollTo(0,500);}')
            assert fixture.page.evaluate('()=>window.scrollY') == 500
            fixture.page.locator('#runtime-host .nav-link[data-view="create"]').dispatch_event('click')
            expect(fixture.page.locator('#runtime-host #view-create')).to_be_visible()
            fixture.page.wait_for_function('()=>window.scrollY===0')

        def incomplete_keyboard_events(fixture):
            fixture.prepare()
            fixture.mount()
            fixture.page.evaluate('''()=>{
              const root=document.querySelector('#runtime-host').shadowRoot;
              const body=root.querySelector('.reference-body'),input=root.querySelector('#search-input');
              body.dispatchEvent(new Event('keydown',{bubbles:true,composed:true}));
              for(const key of [null,17,{}]){
                const event=new Event('keydown',{bubbles:true,composed:true});
                Object.defineProperty(event,'key',{value:key});input.dispatchEvent(event);
              }
              for(const key of ['Escape','z','Z','Unidentified'])
                input.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,bubbles:true,composed:true}));
            }''')
            expect(fixture.page.locator('#runtime-host #view-home')).to_be_visible()

        def composer_attachment_controls(fixture):
            fixture.prepare()
            fixture.mount()
            fixture.compose()
            with fixture.page.expect_file_chooser() as chooser:
                fixture.page.locator('#runtime-host label[for="post-image-files"]').click()
            chooser.value.set_files([
                {'name': 'first.png', 'mimeType': 'image/png', 'buffer': PNG},
                {'name': 'second.png', 'mimeType': 'image/png', 'buffer': PNG}])
            fixture.page.locator('#runtime-host #post-audio-file').set_input_files(
                {'name': 'sound.wav', 'mimeType': 'audio/wav', 'buffer': buffer.getvalue()})
            expect(fixture.page.locator('#runtime-host #upload-selection img')).to_have_count(2)
            expect(fixture.page.locator('#runtime-host label[for="post-image-files"]')).to_contain_text('已选 2 项')
            fixture.page.locator('#runtime-host [data-clear-upload="post-image-files"]').click()
            assert fixture.page.locator('#runtime-host #post-image-files').evaluate('(input)=>input.files.length') == 0
            expect(fixture.page.locator('#runtime-host #post-image-files')).to_be_focused()
            expect(fixture.page.locator('#runtime-host #upload-selection')).to_contain_text('sound.wav')
            assert fixture.writes('/api/uploads') == [] and fixture.writes('/api/posts') == []
            fixture.page.locator('#runtime-host [data-clear-upload="post-audio-file"]').click()
            expect(fixture.page.locator('#runtime-host #upload-selection')).to_be_hidden()
            expect(fixture.page.locator('#runtime-host label[for="post-image-files"]')).to_contain_text('选择图片')
            expect(fixture.page.locator('#runtime-host #post-form textarea[name="content"]')).to_have_value('隔离发布，不连接真实服务器')

        def composer_hidden_invalid_url(fixture):
            fixture.prepare()
            fixture.mount()
            fixture.compose()
            details = fixture.page.locator('#runtime-host #post-link-options')
            expect(details).not_to_have_attribute('open', '')
            details.locator('summary').click()
            fixture.page.locator('#runtime-host input[name="audio"]').fill('invalid-url')
            details.locator('summary').click()
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(details).to_have_attribute('open', '')
            expect(fixture.page.locator('#runtime-host input[name="audio"]')).to_be_focused()
            assert fixture.writes('/api/posts') == []

        def composer_restores_links_and_quote(fixture):
            fixture.prepare('?view=create')
            fixture.page.evaluate('''()=>sessionStorage.setItem('artlive.community.reference.draft.v1:42',JSON.stringify({actorId:'42',savedAt:Date.now(),draft:{
              content:'保留的创作心得',images:'/uploads/linked.png',audio:'https://media.example.test/sound.wav',video:'',tags:'山水,写意',
              quote:{id:8,available:true,content:'原帖内容',author:{id:99,nickname:'原帖作者'},createTime:'2026-11-12 00:00:00'}
            }}))''')
            fixture.mount()
            expect(fixture.page.locator('#runtime-host #view-create')).to_be_visible()
            expect(fixture.page.locator('#runtime-host #post-link-options')).to_have_attribute('open', '')
            expect(fixture.page.locator('#runtime-host input[name="images"]')).to_have_value('/uploads/linked.png')
            expect(fixture.page.locator('#runtime-host input[name="audio"]')).to_have_value('https://media.example.test/sound.wav')
            expect(fixture.page.locator('#runtime-host #quote-compose-panel')).to_contain_text('原帖作者')
            fixture.page.locator('#runtime-host #cancel-quote-draft').click()
            expect(fixture.page.locator('#runtime-host #quote-compose-panel')).to_be_hidden()
            expect(fixture.page.locator('#runtime-host #post-form textarea[name="content"]')).to_have_value('保留的创作心得')
            assert fixture.writes('/api/uploads') == [] and fixture.writes('/api/posts') == []
            fixture.page.locator('#runtime-host #publish-button').click()
            expect(fixture.page.locator('#runtime-host #view-detail')).to_be_visible()
            fixture.page.locator('#runtime-host .nav-link[data-view="create"]').click()
            expect(fixture.page.locator('#runtime-host #post-link-options')).not_to_have_attribute('open', '')
            expect(fixture.page.locator('#runtime-host #post-form textarea[name="content"]')).to_have_value('')
            expect(fixture.page.locator('#runtime-host input[name="images"]')).to_have_value('')

        def artwork_room(fixture,shared=None):
            fixture.artwork_size=(1000,2000);fixture.share_presenter=shared
            fixture.prepare();fixture.page.evaluate('()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;}')
            fixture.mount();fixture.entered_room();fixture.page.locator('#runtime-host #room-voice-later').click()
            fixture.page.locator('#runtime-host #room-artwork').evaluate('(image)=>image.decode()')
            if shared==42:fixture.page.locator('#runtime-host #share-annotation-mode').click()

        def annotation_exit(fixture,shared=None):
            artwork_room(fixture,shared)
            item=fixture.page.locator('#runtime-host [data-select-annotation="other"]')
            focus=fixture.page.locator('#runtime-host .focus-dim')
            item.click();expect(focus).to_have_count(1)
            item.click();expect(focus).to_have_count(0)
            item.click();fixture.page.keyboard.press('Escape');expect(focus).to_have_count(0)
            item.click();fixture.page.locator('#runtime-host #clear-annotation-selection').click();expect(focus).to_have_count(0)
            if shared:
                item.click();expect(focus).to_have_count(1)
            else:
                fixture.page.locator('#runtime-host .annotation-shape[data-annotation-shape="other"]').click();expect(focus).to_have_count(1)
            fixture.page.locator('#runtime-host .annotation-shape[data-annotation-shape="other"]').click();expect(focus).to_have_count(0)
            item.click();stage=fixture.page.locator('#runtime-host #artwork-stage').bounding_box()
            fixture.page.mouse.click(stage['x']+5,stage['y']+5);expect(focus).to_have_count(0)
            if shared:
                assert fixture.page.evaluate('()=>window.__reviewSockets.flatMap(s=>s.sent).filter(m=>m.type==="share.annotation").at(-1).annotationId') is None

        def viewer_focus_is_local(fixture):
            artwork_room(fixture,99)
            focus=fixture.page.locator('#runtime-host .focus-dim');expect(focus).to_have_count(1)
            fixture.page.locator('#runtime-host #clear-annotation-selection').click();expect(focus).to_have_count(0)
            assert fixture.page.evaluate('()=>window.__reviewSockets.flatMap(s=>s.sent).filter(m=>m.type==="share.annotation").length')==0
            fixture.page.evaluate('()=>window.__reviewSockets.at(-1).emit("share.annotation",{annotationId:"other"})')
            expect(focus).to_have_count(1)

        def canvas_geometry(fixture):
            artwork_room(fixture)
            for width,height in [(1440,900),(1024,768),(768,1024),(390,844)]:
                fixture.page.set_viewport_size({'width':width,'height':height})
                fixture.page.wait_for_function("""()=>{const r=document.querySelector('#runtime-host').shadowRoot,i=r.querySelector('#room-artwork'),s=r.querySelector('#annotation-layer').getBoundingClientRect();return s.width>0&&Math.abs(s.width/s.height-i.naturalWidth/i.naturalHeight)<.001;}""")
                fixture.page.locator('#runtime-host [data-canvas-tool="rectangle"]').click()
                image=fixture.page.locator('#runtime-host #room-artwork').bounding_box()
                fixture.page.mouse.move(image['x']+.25*image['width'],image['y']+.6*image['height']);fixture.page.mouse.down()
                fixture.page.mouse.move(image['x']+.35*image['width'],image['y']+.7*image['height'],steps=3);fixture.page.mouse.up()
                pending=fixture.page.locator('#runtime-host [data-annotation-shape="pending"]');expect(pending).to_have_count(1)
                values=pending.evaluate('(r)=>["x","y","width","height"].map(k=>Number(r.getAttribute(k)))')
                assert all(abs(a-b)<.005 for a,b in zip(values,[.25,.6,.1,.1])),(width,height,values)
                fixture.page.locator('#runtime-host #cancel-annotation').click()
            fixture.page.screenshot(path=str(args.output/'canvas-phone.png'),full_page=True)

        def microphone_reconnect(fixture,cancel=False,failures=0):
            artwork_room(fixture)
            fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===1')
            fixture.page.evaluate('()=>window.__reviewMicRequests[0]()')
            expect(fixture.page.locator('#runtime-host #room-voice-action')).to_have_text('关闭麦克风')
            fixture.snapshot_failures=failures
            fixture.page.evaluate('()=>window.__reviewSockets.at(-1).close(1006)')
            assert fixture.page.evaluate('()=>window.__reviewTracks[0].enabled') is False
            if cancel:fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.wait_for_function('()=>window.__reviewSockets.length>=2&&window.__reviewSockets.at(-1).sent.some(m=>m.type==="voice.join")',timeout=20000)
            fixture.flush()
            if cancel:
                expect(fixture.page.locator('#runtime-host #room-voice-action')).to_have_text('开启麦克风')
                assert fixture.page.evaluate('()=>window.__reviewTracks[0].stops')==1
                assert fixture.page.evaluate('()=>window.__reviewSockets.flatMap(s=>s.sent).filter(m=>m.type==="voice.start").length')==1
            else:
                expect(fixture.page.locator('#runtime-host #room-voice-action')).to_have_text('关闭麦克风')
                assert fixture.page.evaluate('()=>window.__reviewTracks[0].enabled') is True
                assert fixture.page.evaluate('()=>window.__reviewTracks[0].stops')==0
                assert fixture.page.evaluate('()=>window.__reviewMicRequests.length')==1
                assert fixture.page.evaluate('()=>window.__reviewSockets.flatMap(s=>s.sent).filter(m=>m.type==="voice.start").length')==2

        def microphone_terminal_close(fixture):
            artwork_room(fixture)
            fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===1')
            fixture.page.evaluate('()=>window.__reviewMicRequests[0]()')
            expect(fixture.page.locator('#runtime-host #room-voice-action')).to_have_text('关闭麦克风')
            fixture.page.evaluate('()=>window.__reviewSockets.at(-1).close(4403)')
            assert fixture.page.evaluate('()=>window.__reviewTracks[0].stops')==1
            expect(fixture.page.locator('#runtime-host #room-connection-status')).to_contain_text('权限或登录状态已变化')
            fixture.page.evaluate('()=>window.dispatchEvent(new Event("online"))')
            assert fixture.page.evaluate('()=>window.__reviewSockets.length')==1

        def ice_restart(fixture):
            artwork_room(fixture)
            fixture.page.evaluate("""()=>{window.__reviewPCs=[];
              window.RTCPeerConnection=class {
                constructor(){this.connectionState='new';this.signalingState='stable';this.offers=[];this.restarts=0;window.__reviewPCs.push(this);}
                addTrack(){} addTransceiver(){} close(){this.connectionState='closed';} setConfiguration(){}
                async createOffer(options={}){this.offers.push(options);return {type:'offer',sdp:'fixture-sdp'};}
                async setLocalDescription(value){this.localDescription=value;}
                restartIce(){this.restarts++;}
              };
            }""")
            fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===1')
            fixture.page.evaluate('()=>window.__reviewMicRequests[0]()')
            expect(fixture.page.locator('#runtime-host #room-voice-action')).to_have_text('关闭麦克风')
            fixture.page.evaluate('()=>{const s=window.__reviewSockets.at(-1);s.emit("voice.joined",{peerId:"zz-peer",userId:43,speaking:false});s.emit("voice.updated",{peerId:"review-self",userId:42,speaking:true});}')
            fixture.page.wait_for_function('()=>window.__reviewPCs.some(pc=>pc.offers.length>0&&pc.connectionState!=="closed")')
            fixture.page.evaluate('()=>{const pc=window.__reviewPCs.findLast(pc=>pc.connectionState!=="closed");pc.connectionState="failed";pc.onconnectionstatechange();}')
            fixture.page.wait_for_function('()=>window.__reviewPCs.some(pc=>pc.restarts===1&&pc.offers.some(value=>value.iceRestart))')
            assert fixture.page.evaluate('()=>window.__reviewTracks[0].stops')==0
            for expected in [2,3]:
                fixture.page.evaluate('()=>{const pc=window.__reviewPCs.findLast(pc=>pc.connectionState!=="closed");pc.onconnectionstatechange();}')
                fixture.page.wait_for_function('(n)=>window.__reviewPCs.some(pc=>pc.restarts===n)',arg=expected)
            fixture.page.evaluate('()=>{const pc=window.__reviewPCs.findLast(pc=>pc.connectionState!=="closed");pc.onconnectionstatechange();}')
            expect(fixture.page.locator('#runtime-host #notice')).to_contain_text('重新开启麦克风')
            fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===2')
            fixture.page.evaluate('()=>window.__reviewMicRequests[1]()')
            expect(fixture.page.locator('#runtime-host #room-voice-action')).to_have_text('关闭麦克风')
            fixture.page.evaluate('()=>window.__reviewSockets.at(-1).emit("voice.updated",{peerId:"review-self",userId:42,speaking:true})')
            fixture.page.wait_for_function('()=>window.__reviewPCs.filter(pc=>pc.connectionState!=="closed").length===1')
            fixture.page.evaluate('()=>{const pc=window.__reviewPCs.findLast(pc=>pc.connectionState!=="closed");pc.connectionState="failed";pc.onconnectionstatechange();}')
            fixture.page.wait_for_function('()=>window.__reviewPCs.at(-1).restarts===1')

        def canvas_zoom_and_pan(fixture):
            artwork_room(fixture)
            stage=fixture.page.locator('#runtime-host #artwork-stage')
            for _ in range(3):stage.dispatch_event('wheel',{'deltaY':-100})
            fixture.page.locator('#runtime-host [data-canvas-tool="pan"]').click()
            box=fixture.page.locator('#runtime-host #room-artwork').bounding_box()
            fixture.page.mouse.move(box['x']+.7*box['width'],box['y']+.6*box['height']);fixture.page.mouse.down()
            fixture.page.mouse.move(box['x']+.7*box['width']+15,box['y']+.6*box['height']+10);fixture.page.mouse.up()
            fixture.page.locator('#runtime-host [data-canvas-tool="rectangle"]').click()
            box=fixture.page.locator('#runtime-host #room-artwork').bounding_box()
            fixture.page.mouse.move(box['x']+.25*box['width'],box['y']+.6*box['height']);fixture.page.mouse.down()
            fixture.page.mouse.move(box['x']+.35*box['width'],box['y']+.7*box['height'],steps=3);fixture.page.mouse.up()
            rect=fixture.page.locator('#runtime-host [data-annotation-shape="pending"]');expect(rect).to_have_count(1)
            values=rect.evaluate('(r)=>["x","y","width","height"].map(k=>Number(r.getAttribute(k)))')
            assert all(abs(a-b)<.005 for a,b in zip(values,[.25,.6,.1,.1])),values

        def shared_center_after_resize(fixture):
            artwork_room(fixture,99)
            fixture.page.evaluate('()=>window.__reviewSockets.at(-1).emit("share.viewport",{scale:2,panX:.1,panY:.1,centerX:.25,centerY:.75})')
            for width,height in [(1024,768),(768,1024),(1440,900)]:
                fixture.page.set_viewport_size({'width':width,'height':height});fixture.flush()
                fixture.page.wait_for_function("""()=>{const r=document.querySelector('#runtime-host').shadowRoot,s=r.querySelector('#artwork-stage').getBoundingClientRect(),a=r.querySelector('#annotation-layer').getBoundingClientRect();return Math.abs(a.x+a.width*.25-(s.x+s.width/2))<1&&Math.abs(a.y+a.height*.75-(s.y+s.height/2))<1;}""")

        def rtc_config_timeout(fixture):
            fixture.hold.add('/api/rtc-config')
            artwork_room(fixture)
            assert fixture.page.evaluate('()=>window.__reviewSockets.at(-1).sent.some(m=>m.type==="voice.join")')
            fixture.page.locator('#runtime-host #room-voice-action').click()
            fixture.page.wait_for_function('()=>window.__reviewMicRequests.length===1',timeout=10000)

        def reconnect_snapshot_order(fixture):
            artwork_room(fixture)
            pending=[]
            def hold(route):
                pending.append(route);fixture.page.evaluate("(n)=>window.__reviewSnapshotsPending=n",len(pending))
            fixture.page.route('**/api/v2/rooms/A/snapshot',hold)
            fixture.page.evaluate('()=>window.__reviewSockets.at(-1).close(1006)')
            fixture.page.wait_for_function('()=>document.querySelector("#runtime-host").shadowRoot.querySelector("#room-connection-status").textContent.includes("恢复")')
            fixture.page.wait_for_function('()=>window.__reviewSnapshotsPending===1')
            assert len(pending)==1
            fixture.page.evaluate('()=>window.dispatchEvent(new Event("online"))')
            fixture.page.wait_for_function('()=>window.__reviewSnapshotsPending===2')
            assert len(pending)==2
            def answer(route,name):
                value=room();value['name']=name
                fixture.reply(route,{'room':value,'members':[],'annotations':[],'drawings':[],'messages':[]})
            answer(pending[1],'NEW');expect(fixture.page.locator('#runtime-host #room-title')).to_have_text('NEW')
            answer(pending[0],'OLD');fixture.flush();expect(fixture.page.locator('#runtime-host #room-title')).to_have_text('NEW')

        scenario('rtc-config-timeout-does-not-block-voice-join',rtc_config_timeout)
        scenario('newer-reconnect-snapshot-rejects-late-older-snapshot',reconnect_snapshot_order)
        scenario('pointer-coordinates-survive-canvas-zoom-and-pan',canvas_zoom_and_pan)
        scenario('shared-artwork-center-survives-viewport-rotation',shared_center_after_resize)
        scenario('terminal-permission-close-stops-mic-and-does-not-reconnect',microphone_terminal_close)
        scenario('failed-webrtc-peer-restarts-ice-with-retained-mic',ice_restart)
        scenario('annotation-repeat-blank-button-and-escape',annotation_exit)
        scenario('shared-presenter-clears-shared-selection',lambda fixture:annotation_exit(fixture,42))
        scenario('shared-viewer-dismisses-only-local-focus',viewer_focus_is_local)
        scenario('canvas-image-alignment-and-pointer-coordinates-after-resize',canvas_geometry)
        scenario('microphone-recovers-with-retained-authorized-stream',microphone_reconnect)
        scenario('cancel-during-reconnect-never-reopens-microphone',lambda fixture:microphone_reconnect(fixture,cancel=True))
        scenario('reconnect-retries-failed-room-snapshots',lambda fixture:microphone_reconnect(fixture,failures=2))
        scenario('composer-attachment-chooser-and-independent-removal', composer_attachment_controls)
        scenario('composer-hidden-invalid-url-opens-before-validation', composer_hidden_invalid_url)
        scenario('composer-restores-links-and-quote-and-resets-after-publish', composer_restores_links_and_quote)
        scenario('incomplete-keyboard-events-do-not-crash-community', incomplete_keyboard_events)
        scenario('retired-poet-link-opens-discovery-without-poet-requests', retired_poet_link)
        scenario('section-navigation-returns-to-top', navigation_returns_to_top)
        scenario('truncated-200-reconciles-with-one-post', truncated_success)
        scenario('storage-write-refusal-before-post', lambda fixture: storage_refusal(fixture, 'setItem'))
        scenario('storage-read-refusal-before-post', lambda fixture: storage_refusal(fixture, 'getItem'))
        scenario('three-day-unconfirmed-operation-preserved', old_pending_survives)
        scenario('corrupt-journal-preserved-and-recoverable', corrupt_journal)
        scenario('confirmed-receipt-storage-failure-does-not-repost', confirmed_receipt_storage_refusal)
        scenario('native-audio-video-and-stream-disposed', playback_cleanup)
        scenario('late-microphone-tracks-stopped', delayed_microphone)
        scenario('same-room-reentry-rejects-old-microphone', same_room_mic_reentry)
        scenario('aborted-read-has-no-unhandled-rejection', cancel_reads)
        scenario('account-switch-stops-old-upload-sequence', account_switch_upload)
        scenario('late-old-cleanup-preserves-new-account', late_cleanup_preserves_account)
        # Explicitly retain unexpected errors; no global error/rejection suppression.
        context = browser.new_context(service_workers='block')
        page = context.new_page()
        page.add_init_script("window.addEventListener('unhandledrejection',()=>{window.__reviewUnexpectedSeen=true;});")
        fixture = Fixture(page)
        fixture.bad_tags = True
        fixture.prepare()
        fixture.mount()
        page.wait_for_function('()=>window.__reviewUnexpectedSeen===true')
        assert any('length' in error for error in fixture.errors), fixture.errors
        report['cases'].append({'name': 'unexpected-errors-are-not-suppressed', 'pass': True, 'page_errors': fixture.errors, 'expected_error': True})
        page.evaluate('()=>window.__reviewDispose()')
        context.close()
        report['pass'] = True
    except Exception as error:
        report['pass'] = False
        report['failure'] = str(error)
        raise
    finally:
        browser.close()
        (args.output / 'RUNTIME_RESULT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
