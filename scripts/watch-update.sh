#!/bin/bash
# =============================================================================
# LEPODER Portal - Update Watcher
# Add this to Synology Task Scheduler to run every 5 minutes
# =============================================================================

PORTAL_DIR="${PORTAL_DIR:-/volume1/docker/lepoder-portal}"
TRIGGER_FILE="${PORTAL_DIR}/data/update-trigger"
UPDATE_SCRIPT="${PORTAL_DIR}/scripts/update.sh"

# Check if trigger file exists
if [ -f "$TRIGGER_FILE" ]; then
    echo "[$(date)] Update trigger detected!"
    
    # Remove trigger file first (to prevent re-runs)
    rm -f "$TRIGGER_FILE"
    
    # Run the update script
    if [ -x "$UPDATE_SCRIPT" ]; then
        "$UPDATE_SCRIPT"
    else
        echo "[$(date)] Error: Update script not found or not executable"
        exit 1
    fi
else
    # Silent exit - no update needed
    exit 0
fi
