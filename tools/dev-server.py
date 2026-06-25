#!/usr/bin/env python3
"""Local dev server for the modular src/ app.

Serves the repo root over http with caching DISABLED, so editing a JS module and
reloading always picks up the new code. Plain `python3 -m http.server` lets the
browser cache ES modules and can silently keep running stale code after an edit
(some modules refetch, others don't) — which makes in-browser verification lie.

Run:  python3 tools/dev-server.py [port]   (default 8778)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8778


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    print(f'Serving {ROOT} at http://127.0.0.1:{PORT} (no-cache)')
    try:
        ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler).serve_forever()
    except KeyboardInterrupt:
        pass
