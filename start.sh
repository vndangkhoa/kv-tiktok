#!/usr/bin/env bash
# kv-tiktok launcher (Linux/macOS)
# Usage: ./start.sh [start|stop|restart|status|docker|docker-down]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
RUN_DIR="$ROOT/.run"
BACKEND_PORT=8002
FRONTEND_PORT=5173
VENV="$BACKEND_DIR/.venv"

# Prefer Python 3.9-3.12 (Playwright/greenlet don't support 3.13+ yet)
PYTHON=""
for v in python3.12 python3.11 python3.10 python3.9; do
    if command -v "$v" >/dev/null 2>&1; then PYTHON="$v"; break; fi
done
[ -z "$PYTHON" ] && PYTHON=python3

# setsid is missing on macOS; process-group kill then falls back to plain kill
command -v setsid >/dev/null 2>&1 && SETSID="setsid " || SETSID=""

mkdir -p "$RUN_DIR"

log()  { printf '\033[1;36m%s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }

is_running() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

port_busy() {
    (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":$1 "
}

setup_backend() {
    if [ ! -x "$VENV/bin/python" ]; then
        log "Creating Python venv ($PYTHON)..."
        "$PYTHON" -m venv "$VENV"
        "$VENV/bin/pip" install -q --upgrade pip
        "$VENV/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
    fi
    if [ ! -d "$HOME/.cache/ms-playwright" ]; then
        warn "Playwright browsers not found - installing chromium..."
        "$VENV/bin/python" -m playwright install chromium
    fi
}

setup_frontend() {
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        log "Installing frontend dependencies..."
        (cd "$FRONTEND_DIR" && npm ci)
    fi
}

start() {
    if is_running "$RUN_DIR/backend.pid" || is_running "$RUN_DIR/frontend.pid" || port_busy "$BACKEND_PORT" || port_busy "$FRONTEND_PORT"; then
        warn "App already running. Run './start.sh restart' to restart."
        return 1
    fi

    setup_backend
    setup_frontend

    # Run each server in its own session so killing the parent PID
    # also stops its children (npm -> vite, python -> uvicorn)
    log "Starting backend on port $BACKEND_PORT..."
    (cd "$BACKEND_DIR" && $SETSID nohup "$VENV/bin/python" run_server.py </dev/null >"$RUN_DIR/backend.log" 2>&1 & echo $! >"$RUN_DIR/backend.pid")

    log "Starting frontend on port $FRONTEND_PORT..."
    (cd "$FRONTEND_DIR" && $SETSID nohup npm run dev </dev/null >"$RUN_DIR/frontend.log" 2>&1 & echo $! >"$RUN_DIR/frontend.pid")

    log "Waiting for backend to become healthy..."
    for i in $(seq 1 30); do
        if curl -sf "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
            ok "Backend healthy: http://localhost:$BACKEND_PORT"
            break
        fi
        if ! kill -0 "$(cat "$RUN_DIR/backend.pid")" 2>/dev/null; then
            warn "Backend exited - see $RUN_DIR/backend.log"
            return 1
        fi
        sleep 1
    done

    ok "Frontend: http://localhost:$FRONTEND_PORT"
    ok "Logs: $RUN_DIR/backend.log, $RUN_DIR/frontend.log"
}

stop() {
    for name in backend frontend; do
        pid_file="$RUN_DIR/$name.pid"
        if is_running "$pid_file"; then
            log "Stopping $name (PID $(cat "$pid_file"))..."
            # Negative PID = process group, kills children too
            kill -TERM -"$(cat "$pid_file")" 2>/dev/null || kill "$(cat "$pid_file")" 2>/dev/null || true
            rm -f "$pid_file"
        fi
    done
    # Fallback: kill anything still holding the ports
    for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
        fuser -k "${port}/tcp" 2>/dev/null || true
    done
    ok "Stopped."
}

restart() { stop; sleep 1; start; }

status() {
    for name in backend frontend; do
        pid_file="$RUN_DIR/$name.pid"
        if is_running "$pid_file" || port_busy "$([ "$name" = backend ] && echo "$BACKEND_PORT" || echo "$FRONTEND_PORT")"; then
            ok "$name: running (PID $(cat "$pid_file" 2>/dev/null || echo unknown))"
        else
            warn "$name: stopped"
        fi
    done
    if command -v docker >/dev/null 2>&1 && docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | grep -q kv-tiktok; then
        ok "docker: container running"
    fi
}

docker_up() {
    docker compose -f "$ROOT/docker-compose.yml" up -d --build
    ok "Container started: http://localhost:$BACKEND_PORT"
}

docker_down() {
    docker compose -f "$ROOT/docker-compose.yml" down
    ok "Container stopped."
}

case "${1:-start}" in
    start)  start ;;
    stop)   stop ;;
    restart) restart ;;
    status) status ;;
    docker) docker_up ;;
    docker-down) docker_down ;;
    *)
        echo "Usage: $0 [start|stop|restart|status|docker|docker-down]" >&2
        exit 1
        ;;
esac
