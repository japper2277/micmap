#!/bin/bash
# =============================================================================
# GTFS Supplemented Auto-Update Script
# Downloads fresh MTA subway schedules (updated hourly by MTA)
# Run weekly via cron or manually: ./scripts/update-gtfs.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
GTFS_DIR="$PROJECT_DIR/gtfs_supplemented"
GTFS_URL="https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip"
TEMP_ZIP="/tmp/gtfs_supplemented.zip"

echo "📥 Downloading GTFS supplemented data..."
curl -sS -o "$TEMP_ZIP" "$GTFS_URL"

if [ ! -f "$TEMP_ZIP" ]; then
    echo "❌ Download failed"
    exit 1
fi

echo "📦 Extracting to $GTFS_DIR..."
rm -rf "$GTFS_DIR"
mkdir -p "$GTFS_DIR"
unzip -q "$TEMP_ZIP" -d "$GTFS_DIR"

echo "🧹 Cleaning up..."
rm "$TEMP_ZIP"

echo "✅ GTFS updated successfully!"
echo "   Files: $(ls -1 "$GTFS_DIR" | wc -l | tr -d ' ')"
echo "   Size: $(du -sh "$GTFS_DIR" | cut -f1)"
echo "   Updated: $(date)"
