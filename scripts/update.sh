#!/bin/bash
# =============================================================================
# LEPODER Portal - Self-Update Script
# Run this on Synology host (not inside container)
# =============================================================================

set -e

PORTAL_DIR="${PORTAL_DIR:-/volume1/docker/lepoder-portal}"
LOG_FILE="${PORTAL_DIR}/update.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$PORTAL_DIR" || { echo "Directory not found: $PORTAL_DIR"; exit 1; }

log "=========================================="
log "Starting LEPODER Portal update..."
log "=========================================="

# 1. Fetch and check for updates
log "Fetching latest changes from GitHub..."
git fetch origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date. No update needed."
    exit 0
fi

log "Update available: $LOCAL -> $REMOTE"

# 2. Pull latest code
log "Pulling latest code..."
git pull origin main

# 3. Check if package.json changed (need full rebuild)
CHANGED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE")
NEEDS_REBUILD=false

if echo "$CHANGED_FILES" | grep -q "package.json\|pnpm-lock.yaml\|package-lock.json"; then
    log "Dependencies changed - full rebuild required"
    NEEDS_REBUILD=true
fi

# 4. Build and restart
if [ "$NEEDS_REBUILD" = true ]; then
    log "Building Docker image (no cache)..."
    docker compose build --no-cache
else
    log "Building Docker image..."
    docker compose build
fi

log "Restarting containers..."
docker compose up -d

# 5. Run migrations if needed
if echo "$CHANGED_FILES" | grep -q "prisma/"; then
    log "Database schema changed - running migrations..."
    docker compose run --rm portal npx prisma db push
fi

# 6. Cleanup
log "Cleaning up old images..."
docker image prune -f

log "=========================================="
log "Update complete!"
log "New version: $(git rev-parse --short HEAD)"
log "=========================================="

# Write status for API to read
echo "{\"status\":\"success\",\"version\":\"$(git rev-parse --short HEAD)\",\"timestamp\":\"$(date -Iseconds)\"}" > "$PORTAL_DIR/update-status.json"
