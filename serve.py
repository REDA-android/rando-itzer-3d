import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

def run_server():
    global PORT
    for port_attempt in range(PORT, PORT + 20):
        try:
            with socketserver.TCPServer(("", port_attempt), Handler) as httpd:
                PORT = port_attempt
                url = f"http://localhost:{PORT}/index.html"
                print(f"Serveur 3D Topographie démarré sur : {url}")
                print(f"Répertoire servi : {DIRECTORY}")
                print("Appuyez sur Ctrl+C pour arrêter le serveur.")
                webbrowser.open(url)
                httpd.serve_forever()
                break
        except OSError:
            continue

if __name__ == '__main__':
    run_server()
