#!/bin/sh
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR/app" || exit 1
export HOSTNAME=0.0.0.0
# PORT is not set here on purpose: pocketdeck.env can set it, and the server defaults to 3000.
echo "Starting PocketDeck. Keep this Terminal window open while using the deck."
echo "On this Mac, open http://localhost:3000 (or the PORT you set in pocketdeck.env)"
echo "Scan the QR code with a phone browser on the same Wi-Fi."
if [ -f ../pocketdeck.env ]; then
  exec "$SCRIPT_DIR/runtime/node" --env-file=../pocketdeck.env server.js
else
  exec "$SCRIPT_DIR/runtime/node" server.js
fi
