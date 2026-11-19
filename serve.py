#!/usr/bin/env python3
"""Dev server for NIGHT AUDIT.

Serves this folder with caching disabled, and accepts POST /__log so the page
can mirror its log to .devlog.jsonl while it runs in the iOS Simulator or on a
phone.

    python3 serve.py [port] [--lan]

By default it listens on 127.0.0.1 only. --lan listens on every interface so a
phone on the same Wi-Fi can open http://<this-mac>.local:<port>.
"""
import http.server
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(ARGS[0]) if ARGS else 8767
HOST = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
LOG_PATH = os.environ.get("NA_LOG", os.path.join(ROOT, ".devlog.jsonl"))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/__log":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(min(length, 1_000_000))
        try:
            entry = json.loads(body)
        except ValueError:
            entry = {"raw": body.decode("utf-8", "replace")}
        entry["t_server"] = time.strftime("%H:%M:%S")
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        if not (args and "/__log" in str(args[0])):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"Serving {ROOT} on http://{HOST}:{PORT}  (log: {LOG_PATH})", flush=True)
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
