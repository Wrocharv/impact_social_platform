#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Cole a DATABASE_URL e pressione Enter:"
read -r -s DATABASE_URL
echo

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL vazia. Tente novamente."
  exit 1
fi

export DATABASE_URL

pkill -f "server/_core/index.ts" 2>/dev/null || true

echo "Subindo servidor em http://127.0.0.1:3004 ..."
pnpm dev