#!/bin/sh
# Run this on a Mac. Makes dist/CODDY-<version>.dmg
cd "$(dirname "$0")" || exit 1
[ "$(uname)" = "Darwin" ] || { echo "The macOS app can only be built on a Mac."; exit 1; }
npm install && npm run dist:mac && echo "Done: the .dmg is in the dist folder."
