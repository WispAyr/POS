#!/bin/bash
# POS Watchdog Script
# Ensures services start cleanly by clearing stale port bindings

BACKEND_PORT=3000
FRONTEND_PORT=5173
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/watchdog.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

clear_port() {
    local port=$1
    local pids=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pids" ]; then
        log "Clearing port $port (PIDs: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 1
    fi
}

health_check() {
    local url=$1
    local name=$2
    if curl -s --connect-timeout 5 "$url" > /dev/null 2>&1; then
        log "$name is healthy"
        return 0
    else
        log "$name health check failed"
        return 1
    fi
}

case "$1" in
    clear-ports)
        log "Clearing ports..."
        clear_port $BACKEND_PORT
        clear_port $FRONTEND_PORT
        log "Ports cleared"
        ;;

    start)
        log "Starting POS services..."
        clear_port $BACKEND_PORT
        clear_port $FRONTEND_PORT

        export PATH="/opt/homebrew/bin:$PATH"
        cd "$PROJECT_DIR"
        pm2 start ecosystem.config.js

        log "Services started"
        ;;

    restart)
        log "Restarting POS services..."
        clear_port $BACKEND_PORT
        clear_port $FRONTEND_PORT

        export PATH="/opt/homebrew/bin:$PATH"
        pm2 restart all

        log "Services restarted"
        ;;

    stop)
        log "Stopping POS services..."
        export PATH="/opt/homebrew/bin:$PATH"
        pm2 stop all

        clear_port $BACKEND_PORT
        clear_port $FRONTEND_PORT

        log "Services stopped"
        ;;

    health)
        log "Running health checks..."
        health_check "http://localhost:$BACKEND_PORT/api/health" "Backend"
        backend_status=$?
        health_check "http://localhost:$FRONTEND_PORT" "Frontend"
        frontend_status=$?

        if [ $backend_status -eq 0 ] && [ $frontend_status -eq 0 ]; then
            log "All services healthy"
            exit 0
        else
            log "Health check failed"
            exit 1
        fi
        ;;

    status)
        export PATH="/opt/homebrew/bin:$PATH"
        pm2 list
        ;;

    *)
        echo "Usage: $0 {clear-ports|start|restart|stop|health|status}"
        exit 1
        ;;
esac
