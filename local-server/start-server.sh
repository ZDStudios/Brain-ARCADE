#!/bin/sh
# Run the Brain Arcade server on macOS / Linux (needs Python 3.8+).
cd "$(dirname "$0")" && exec python3 brain_arcade_server.py "$@"
