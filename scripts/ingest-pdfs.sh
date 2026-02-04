#!/usr/bin/env sh
set -e

NODE_BIN="${NODE_BIN:-/usr/bin/node}"

if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node)"
fi

if [ -z "$NODE_BIN" ]; then
  echo "Node.js not found. Install Node or set NODE_BIN."
  exit 1
fi

if [ -z "$PDFTOTEXT_PATH" ]; then
  if [ -x "/usr/bin/pdftotext" ]; then
    PDFTOTEXT_PATH="/usr/bin/pdftotext"
    export PDFTOTEXT_PATH
  elif [ -x "/usr/local/bin/pdftotext" ]; then
    PDFTOTEXT_PATH="/usr/local/bin/pdftotext"
    export PDFTOTEXT_PATH
  fi
fi

"$NODE_BIN" "$(dirname "$0")/ingest-pdfs.mjs" "$@"
