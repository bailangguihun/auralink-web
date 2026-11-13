"""Isolated reference-room navigation regression, with every request intercepted.

Run with a Python environment containing Playwright:
  python tests/community-v2-navigation.browser.py --output /tmp/community-v2-nav
Set COMMUNITY_CHROMIUM_EXECUTABLE if Chromium is installed outside Playwright.
No dev server, Core account, database, provider or real WebSocket is used.
"""
from pathlib import Path
from urllib.parse import urlparse
import argparse
import hashlib
import json
import os

from playwright.sync_api import sync_playwright, expect


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
assets_root = Path(__file__).resolve().parents[1] / 'public/community-v2'
assets = {file.name: file.read_bytes() for file in assets_root.iterdir() if file.is_file()}
report = {'boundary': 'All HTTP and WebSocket activity intercepted; no server, Core account, database, microphone or provider.',
          'rooms_sha256': hashlib.sha256(assets['rooms.mjs']).hexdigest(), 'cases': [], 'page_errors': []}

SOCKET_FIXTURE = """
window.__reviewSockets=[];
class ReviewSocket extends EventTarget {
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){super();this.url=url;this.readyState=0;this.sent=[];this.closeCodes=[];window.__reviewSockets.push(this);queueMicrotask(()=>{if(this.readyState===0){this.readyState=1;this.dispatchEvent(new Event('open'));}});}
  send(raw){const message=JSON.parse(raw);this.sent.push(message);
    if(message.type==='room.subscribe')queueMicrotask(()=>this.emit('room.subscribed',{}));
    if(message.type==='voice.join')queueMicrotask(()=>this.emit('voice.roster',{selfId:'review-self',limit:6,peers:[]}));
  }
  emit(eventType,data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({eventType,data})}));}
  close(code=1000){if(this.readyState===3)return;this.readyState=3;this.closeCodes.push(code);this.dispatchEvent(new CloseEvent('close',{code}));}
}
window.WebSocket=ReviewSocket;
"""


def room(room_id):
    return {'id': room_id, 'name': '隔离房间 ' + room_id, 'description': '', 'visibility': 'public', 'status': 'active',
            'entryPrice': 0, 'onlineCount': 1, 'memberCount': 1, 'memberLimit': 10,
            'owner': {'id': 99, 'nickname': '隔离房主'}, 'myMembership': {'role': 'member', 'status': 'active'}, 'currentSession': None}


class Fixture:
    def __init__(self, page):
        self.page = page
        self.hold_snapshots = set()
        self.hold_details = set()
        self.hold_tickets = True
        self.pending_snapshots = {}
        self.pending_details = {}
        self.pending_tickets = []
        self.calls = []

    def reply(self, route, data):
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'code': 200, 'message': 'ok', 'data': data}))

    def snapshot(self, room_id):
        return {'room': room(room_id), 'members': [], 'annotations': [], 'drawings': [], 'messages': [], 'histories': []}

    def route(self, route):
        request = route.request
        path = urlparse(request.url).path
        if path == '/':
            return route.fulfill(content_type='text/html', body='<div id="review-host"></div>')
        if path.startswith('/community-v2/'):
            name = path.rsplit('/', 1)[1]
            if name in assets:
                mime = 'text/javascript' if name.endswith('.mjs') else 'text/css' if name.endswith('.css') else 'text/html'
                return route.fulfill(content_type=mime, body=assets[name])
        local = path.removeprefix('/api/community/v2')
        self.calls.append((request.method, local))
        if local == '/api/user/profile':
            return self.reply(route, {'id': 42, 'role': 'user', 'username': 'review', 'nickname': '隔离审查', 'avatar': '', 'createTime': '2026-11-12 00:00:00'})
        if local == '/api/media-session':
            return self.reply(route, {})
        if local == '/api/coins/wallet':
            return self.reply(route, {'balance': 0})
        if local == '/api/notifications':
            return self.reply(route, {'unread': 0, 'items': []})
        if local == '/api/tags':
            return self.reply(route, [])
        if local == '/api/posts':
            return self.reply(route, {'items': [], 'hasMore': False})
        if local == '/api/v2/rooms/public':
            return self.reply(route, {'items': [room('A'), room('B')]})
        if local == '/api/ws-ticket':
            self.pending_tickets.append(route)
            self.page.evaluate('(count)=>window.__reviewTicketCount=count', len(self.pending_tickets))
            if not self.hold_tickets:
                self.reply(route, {'ticket': 'ticket-' + str(len(self.pending_tickets))})
            return
        parts = local.split('/')
        if len(parts) >= 5 and parts[1:4] == ['api', 'v2', 'rooms']:
            room_id = parts[4]
            if len(parts) == 5:
                if room_id in self.hold_details:
                    self.pending_details[room_id] = route
                    self.page.evaluate('(path)=>{window.__reviewHeld||=[];window.__reviewHeld.push(path);}', local)
                    return
                return self.reply(route, room(room_id))
            if parts[-1] == 'join':
                return self.reply(route, room(room_id))
            if parts[-1] == 'snapshot':
                if room_id in self.hold_snapshots:
                    self.pending_snapshots[room_id] = route
                    self.page.evaluate('(path)=>{window.__reviewHeld||=[];window.__reviewHeld.push(path);}', local)
                    return
                return self.reply(route, self.snapshot(room_id))
        raise AssertionError('Unexpected isolated request: ' + request.method + ' ' + request.url)

    def mount(self):
        self.page.add_init_script(SOCKET_FIXTURE)
        self.page.route('**/*', self.route)
        self.page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
        self.page.goto('http://127.0.0.1:39881/')
        self.page.evaluate("""async()=>{const module=await import('/community-v2/runtime.mjs');window.reviewCurrent=true;
          window.reviewDispose=await module.mountCommunity(document.querySelector('#review-host'),{
          token:'ISOLATED_REVIEW',actorId:'42',isCurrent:()=>window.reviewCurrent,signOut:()=>{}});} """)
        self.page.locator('#review-host #home-room-grid [data-enter-room="A"]').wait_for()

    def enter(self, room_id):
        self.page.locator('#review-host .topbar [data-view="rooms"]').click()
        self.page.locator('#review-host #room-grid [data-enter-room="' + room_id + '"]').click()

    def ticket(self, index):
        self.page.wait_for_function('(count)=>window.__reviewTicketCount>=count', arg=index + 1)
        self.reply(self.pending_tickets[index], {'ticket': 'ticket-' + str(index + 1)})

    def held(self, path):
        self.page.wait_for_function('(path)=>window.__reviewHeld?.includes(path)', arg=path)

    def sockets(self):
        return self.page.evaluate('()=>window.__reviewSockets.map(s=>({url:s.url,readyState:s.readyState,sent:s.sent,closeCodes:s.closeCodes}))')

    def flush(self):
        # Drain promise continuations and rendering, with no elapsed-time guess.
        self.page.evaluate('async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));}')


with sync_playwright() as playwright:
    options = {'headless': True, 'args': ['--no-sandbox', '--no-proxy-server']}
    executable = os.environ.get('COMMUNITY_CHROMIUM_EXECUTABLE')
    if executable:
        options['executable_path'] = executable
    browser = playwright.chromium.launch(**options)
    report['browser'] = browser.version
    try:
        def scenario(name, work):
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, service_workers='block')
            page = context.new_page()
            page.set_default_timeout(10000)
            fixture = Fixture(page)
            try:
                fixture.mount()
                work(fixture)
                report['cases'].append({'name': name, 'pass': True})
                print('PASS ' + name, flush=True)
            except Exception:
                page.screenshot(path=str(args.output / (name + '-failure.png')), full_page=True)
                raise
            finally:
                page.evaluate('()=>window.reviewDispose?.()')
                context.close()

        def leave_during_ticket(fixture):
            page = fixture.page
            with page.expect_request('**/api/ws-ticket'):
                fixture.enter('A')
            page.locator('#review-host .topbar .nav-link[data-view="home"]').click()
            fixture.ticket(0)
            fixture.flush()
            assert fixture.sockets() == [], fixture.sockets()
            expect(page.locator('#review-host #view-home')).to_be_visible()

        def room_ticket_reordering(fixture):
            page = fixture.page
            with page.expect_request('**/api/ws-ticket'):
                fixture.enter('A')
            with page.expect_request('**/api/ws-ticket'):
                fixture.enter('B')
            fixture.ticket(1)
            page.wait_for_function('()=>window.__reviewSockets.length===1')
            # Deferred connection preserves the original entry voice prompt.
            expect(page.locator('#review-host #room-voice-prompt')).to_be_visible()
            page.locator('#review-host #room-voice-later').click()
            fixture.ticket(0)
            fixture.flush()
            sockets = fixture.sockets()
            assert len(sockets) == 1, sockets
            assert sockets[0]['sent'][0] == {'type': 'room.subscribe', 'roomId': 'B'}, sockets
            expect(page.locator('#review-host #room-title')).to_have_text('隔离房间 B')
            page.locator('#review-host .topbar .nav-link[data-view="home"]').click()
            assert fixture.sockets()[0]['readyState'] == 3

        def leave_during_snapshot(fixture):
            page = fixture.page
            fixture.hold_snapshots.add('A')
            with page.expect_request('**/api/v2/rooms/A/snapshot'):
                fixture.enter('A')
            page.locator('#review-host .topbar .nav-link[data-view="home"]').click()
            fixture.held('/api/v2/rooms/A/snapshot')
            fixture.reply(fixture.pending_snapshots['A'], fixture.snapshot('A'))
            fixture.flush()
            assert fixture.sockets() == []
            assert fixture.pending_tickets == []
            expect(page.locator('#review-host #room-title')).to_have_text('')
            expect(page.locator('#review-host #view-home')).to_be_visible()

        def leave_during_room_read(fixture):
            page = fixture.page
            fixture.hold_details.add('A')
            with page.expect_request('**/api/v2/rooms/A'):
                fixture.enter('A')
            page.locator('#review-host .topbar .nav-link[data-view="home"]').click()
            fixture.held('/api/v2/rooms/A')
            fixture.reply(fixture.pending_details['A'], room('A'))
            fixture.flush()
            assert ('POST', '/api/v2/rooms/A/join') not in fixture.calls
            assert fixture.sockets() == []
            expect(page.locator('#review-host #view-home')).to_be_visible()

        def dispose_during_ticket(fixture):
            page = fixture.page
            with page.expect_request('**/api/ws-ticket'):
                fixture.enter('A')
            page.evaluate('()=>{window.reviewCurrent=false;window.reviewDispose();}')
            fixture.ticket(0)
            fixture.flush()
            assert fixture.sockets() == []
            assert page.evaluate('()=>document.querySelector("#review-host").shadowRoot.childElementCount') == 0

        scenario('leave-before-ticket', leave_during_ticket)
        scenario('reordered-room-tickets', room_ticket_reordering)
        scenario('leave-before-snapshot', leave_during_snapshot)
        scenario('leave-before-membership-write', leave_during_room_read)
        scenario('dispose-before-ticket', dispose_during_ticket)
        assert report['page_errors'] == [], report['page_errors']
        report['pass'] = True
    except Exception as error:
        report['pass'] = False
        report['failure'] = str(error)
        raise
    finally:
        browser.close()
        (args.output / 'ROOM_NAVIGATION_RESULT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
