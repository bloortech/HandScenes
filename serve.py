# Dev server with caching disabled, so browser always picks up edited files.
# Run: python serve.py   ->   http://localhost:8000
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('', 8000), NoCacheHandler).serve_forever()
