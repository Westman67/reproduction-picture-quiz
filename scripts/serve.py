"""Serve the built quiz over loopback."""
import argparse
import functools
import http.server
import json
import mimetypes
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import urlencode

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8895)
parser.add_argument("--open", action="store_true")
parser.add_argument("--bank", default="", help="open a bank directly, for example combined")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / "dist"
if not (root / "index.html").is_file() or not (root / "data/physiology/question-bank.json").is_file():
    raise SystemExit("Build the quiz first with npm run build.")

for mime, suffix in (("image/webp", ".webp"), ("text/javascript", ".js"), ("image/svg+xml", ".svg")):
    mimetypes.add_type(mime, suffix)


def quiz_url(port):
    query = "?" + urlencode({"bank": args.bank}) if args.bank else ""
    return f"http://127.0.0.1:{port}/{query}"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


try:
    handler = functools.partial(NoCacheHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
except OSError:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{args.port}/data/physiology/question-bank.json", timeout=2) as response:
            running = json.load(response)
        if running.get("title") != "Reproduction Picture Quiz":
            raise ValueError("Different service")
        print(f"Reproduction Picture Quiz is already running at {quiz_url(args.port)}")
        if args.open:
            webbrowser.open(quiz_url(args.port))
        raise SystemExit(0)
    except (OSError, ValueError):
        raise SystemExit(f"Port {args.port} is busy. Run with --port 8896 to choose another port.")

launch_url = quiz_url(server.server_port)
print(f"Reproduction Picture Quiz at {launch_url}", flush=True)
if args.open:
    webbrowser.open(launch_url)
server.serve_forever()
