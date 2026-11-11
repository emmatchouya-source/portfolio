"""Capture initial browser behavior and the existing AeroOptim default calculation."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main():
    artifacts = ROOT / '.test-artifacts'
    artifacts.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            base = f'http://127.0.0.1:{server.server_port}'
            page.goto(base + '/projets/aero-optim/')
            page.locator('[data-tab=optim]').click()
            page.locator('#runOpt').click()
            page.wait_for_function("!document.querySelector('#runOpt').disabled", timeout=120000)
            result = page.evaluate('({params:readParams(), options:readOpt(),base:heat.base,opt:heat.opt})')
            (artifacts / 'aero-baseline.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
            print(json.dumps(result, ensure_ascii=False), flush=True)
            for path in ['/', '/contact.html', '/projets/a380-lab/', '/projets/drone-lab/', '/projets/aero-optim/']:
                for width in [1440, 390]:
                    page.set_viewport_size({'width': width, 'height': 900})
                    page.goto(base + path)
                    page.wait_for_timeout(400)
                    print(json.dumps({'page': path, 'width': width, 'overflow':page.evaluate('document.documentElement.scrollWidth > innerWidth')}), flush=True)
            print('JS errors:', errors, flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
