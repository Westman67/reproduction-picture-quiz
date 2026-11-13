"""Serve this app only on loopback. No uploads, external requests, or dependencies."""
import argparse, functools, http.server, mimetypes, webbrowser, json, urllib.request
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8895);parser.add_argument('--open',action='store_true');parser.add_argument('--bank',default='',help='open a bank directly, for example combined');args=parser.parse_args()
launch_url=f'http://127.0.0.1:{args.port}/'+(f'?bank={args.bank}' if args.bank else '')
root=Path(__file__).resolve().parents[1]
mimetypes.add_type('image/webp','.webp');mimetypes.add_type('text/javascript','.js');mimetypes.add_type('text/javascript','.mjs');mimetypes.add_type('image/svg+xml','.svg')
class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
try:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(NoCacheHandler,directory=str(root)))
except OSError:
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{args.port}/data/question-bank.json',timeout=2) as response:
            running=json.load(response)
        if running.get('title')!='Reproduction Picture Quiz':raise ValueError('Different service')
        print(f'Reproduction Picture Quiz is already running at http://127.0.0.1:{args.port}')
        if args.open:webbrowser.open(launch_url)
        raise SystemExit(0)
    except (OSError,ValueError):
        raise SystemExit(f'Port {args.port} is busy. Run with --port 8896 to choose another port.')
print(f'Reproduction Picture Quiz at {launch_url}',flush=True)
if args.open:webbrowser.open(launch_url)
try:server.serve_forever()
except KeyboardInterrupt:server.server_close()
