#!/bin/bash
# The Asset Admin (fork/asset-admin.cjs, fork/ARTIST.md): double-click to open it (Mac).
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo; echo "Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then double-click this again."; echo
  read -r -p "Press Enter to close." _; exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo; echo "Git is not installed. Run: xcode-select --install   (or get it from https://git-scm.com/download/mac), then double-click this again."; echo
  read -r -p "Press Enter to close." _; exit 1
fi
echo "Starting the Asset Admin. Keep this window open while you use it; close it to stop."
node fork/asset-admin.cjs "$@"
read -r -p "Press Enter to close." _
