#!/bin/sh
# Run this on Linux (or WSL). Makes dist/CODDY-<version>.AppImage and a .deb
cd "$(dirname "$0")" || exit 1
npm install && npm run dist:linux && echo "Done: the AppImage and .deb are in the dist folder."
