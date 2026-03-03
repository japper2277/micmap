#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/jaredapper/Desktop/micmap"
LOG_DIR="$PROJECT_DIR/logs"
REPORT_PATH="$LOG_DIR/laughing-buddha-compare.json"
CHROME_PATH="/Users/jaredapper/.cache/puppeteer/chrome/mac_arm-143.0.7499.40/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"

mkdir -p "$LOG_DIR"

{
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Laughing Buddha live check"
  cd "$PROJECT_DIR"
  export PUPPETEER_EXECUTABLE_PATH="$CHROME_PATH"
  /usr/bin/env node scripts/check-laughing-buddha.js --out "$REPORT_PATH"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Finished Laughing Buddha live check"
} >> "$LOG_DIR/lb-check.log" 2>> "$LOG_DIR/lb-check-error.log"
