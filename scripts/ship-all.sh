#!/usr/bin/env bash
set -euo pipefail

msg="${1:-chore: atualizacao geral}"

echo "[1/6] Atualizando branch main..."
git checkout main >/dev/null 2>&1 || true
git pull --rebase --autostash origin main

echo "[2/6] Validando projeto (pnpm check)..."
if [[ "${SKIP_CHECK:-0}" != "1" ]]; then
  pnpm check
else
  echo "SKIP_CHECK=1 detectado, pulando validacao."
fi

echo "[3/6] Adicionando alteracoes..."
git add -A

if git diff --cached --quiet; then
  echo "Sem alteracoes para commit. Nada para subir."
  exit 0
fi

echo "[4/6] Arquivos que vao subir:"
git status --short

echo "[5/6] Criando commit..."
git commit -m "$msg"

echo "[6/6] Enviando para origin/main..."
git push origin main

echo "Concluido com sucesso."
git --no-pager status --short --branch
