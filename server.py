# Static file server for the game: like `python -m http.server`, but tells the browser never to cache,
# so edited JS modules are always picked up (a cached old module next to a new one gives errors like "Unknown model").
# Usage: python server.py [port] [page to open, e.g. / or /viewer/]
# If the port is already taken (server already running), it just opens the page.
import http.server
import sys
import webbrowser

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
page = sys.argv[2] if len(sys.argv) > 2 else None
url = f'http://localhost:{port}{page or "/"}'
try:
    server = http.server.ThreadingHTTPServer(('', port), NoCache)
except OSError:
    print(f'Port {port} already in use - assuming the server is running.')
    if page: webbrowser.open(url)
    sys.exit(0)
print(f'Serving on {url}  (close this window to stop)')
if page: webbrowser.open(url)          # the socket is already listening, so the page never loads before the server
server.serve_forever()
