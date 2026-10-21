# Brain Arcade control server — for Coolify / Docker on your own VPS.
#
# The server is pure Node (no dependencies, nothing to install). It serves the
# dashboard from control-server/public and the playable games from www/, so the
# image keeps the same control-server/ + www/ layout the code expects.
#
# Build context must be the REPO ROOT (in Coolify leave "Base Directory" as /).
FROM node:20-alpine

WORKDIR /app

# Only the two folders the server actually needs.
COPY control-server/ ./control-server/
COPY www/ ./www/

# Persisted data (device locks, allow-lists, score backups) lives here; mount a
# volume at /data in Coolify to keep it across redeploys.
ENV DATA_DIR=/data
ENV PORT=3000
RUN mkdir -p /data

EXPOSE 3000

# Healthcheck uses busybox wget (already in the alpine image) against the
# server's own identity endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/ping || exit 1

# node:alpine has no init; the server handles SIGTERM itself for a clean, fast
# `docker stop`. (Compose sets init: true as a belt-and-braces reaper.)
CMD ["node", "control-server/server.js"]
