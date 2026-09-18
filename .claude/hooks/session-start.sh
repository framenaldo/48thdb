#!/bin/bash
# Get a fresh web container ready to work on 48thDB.
#
# The container is built from the repo alone, so node_modules is never there:
# without this, the first `npm run smoke` of every session fails on a missing
# playwright and the session spends its first minutes reinstalling by hand.
set -euo pipefail

# Local machines already have their own setup; this is only for the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Chromium is already in the image. Without this, npm's postinstall downloads
# its own copy — ~150 MB, for a browser that is sitting right there.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"

npm install --no-audit --no-fund

# Carry the browser path into the session itself, so `npm run smoke` finds
# Chromium in the agent's shell too and not only in this script's.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
    echo "export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1"
  } >> "$CLAUDE_ENV_FILE"
fi

echo "48thDB พร้อมใช้งาน — npm run lint / npm run smoke <label>"
