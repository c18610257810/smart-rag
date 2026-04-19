#!/usr/bin/env python3
"""
Draw.io SSE Proxy
Converts SSE streaming response to complete response for Obsidian requestUrl
"""

import http.server
import socketserver
import requests
import json
import sys

PORT = 6003
DRAWIO_URL = "http://localhost:6002/api/chat"

class DrawIOProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            print(f"[Proxy] Received request: {len(body)} bytes")
            
            # Forward request to next-ai-draw-io
            headers = {
                'Content-Type': 'application/json'
            }
            
            # Use requests to get streaming response
            response = requests.post(
                DRAWIO_URL,
                data=body,
                headers=headers,
                stream=True,
                timeout=60
            )
            
            print(f"[Proxy] Draw.io response status: {response.status_code}")
            
            # Collect complete SSE stream
            full_response = ""
            for line in response.iter_lines():
                if line:
                    full_response += line.decode('utf-8') + '\n'
            
            print(f"[Proxy] Complete response: {len(full_response)} bytes")
            
            # Return complete response
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', len(full_response))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(full_response.encode('utf-8'))
            
        except Exception as e:
            print(f"[Proxy] Error: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f"Proxy error: {str(e)}".encode('utf-8'))

if __name__ == "__main__":
    print(f"[Proxy] Starting Draw.io SSE proxy on port {PORT}")
    print(f"[Proxy] Forwarding to {DRAWIO_URL}")
    
    with socketserver.TCPServer(("127.0.0.1", PORT), DrawIOProxyHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[Proxy] Shutting down")
            httpd.shutdown()