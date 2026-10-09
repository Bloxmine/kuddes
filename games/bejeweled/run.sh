#!/bin/sh
# Serve the HTML5 port locally (ES modules need http://, not file://)
cd "$(dirname "$0")/web" && echo "Open http://localhost:${PORT:-8080}" && exec python3 -m http.server "${PORT:-8080}" --bind 127.0.0.1
