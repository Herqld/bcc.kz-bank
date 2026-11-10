#!/bin/sh
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || { echo "First start: installing Electron, please wait..."; npm install || exit 1; }
exec npx electron .
