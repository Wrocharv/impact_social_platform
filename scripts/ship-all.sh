#!/usr/bin/env bash
set -euo pipefail

if [[ "${LOCAL_ONLY:-1}" == "1" ]]; then
  echo "Ship remoto bloqueado em modo LOCAL_ONLY."
  echo "Para liberar de forma explicita:"
  echo "ALLOW_REMOTE_PUBLISH=YES LOCAL_ONLY=0 bash scripts/ship-all.sh"
  exit 1
fi

if [[ "${ALLOW_REMOTE_PUBLISH:-}" != "YES" ]]; then
  echo "Publicacao remota bloqueada: defina ALLOW_REMOTE_PUBLISH=YES para continuar."
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$current_branch" != "main" ]]; then
  echo "Publicacao bloqueada: execute a publicacao apenas a partir da branch main."
  echo "Branch atual: $current_branch"
  exit 1
fi

echo "[1/7] Verificando arvore de trabalho limpa..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Publicacao bloqueada: existem alteracoes locais nao commitadas."
  echo "Finalize seus commits primeiro para evitar publicar estado parcial."
  git status --short
  exit 1
fi

echo "[2/7] Atualizando referencias remotas..."
git fetch origin main

if [[ -n "$(git log --oneline HEAD..origin/main)" ]]; then
  echo "Publicacao bloqueada: sua main local esta atras da origin/main."
  echo "Atualize manualmente (rebase/merge) e valide novamente antes de publicar."
  exit 1
fi

echo "[3/7] Validando projeto (pnpm check)..."
if [[ "${SKIP_CHECK:-0}" != "1" ]]; then
  pnpm check
else
  echo "SKIP_CHECK=1 detectado, pulando validacao."
fi

echo "[4/7] Validando politica de campanhas criticas..."
pnpm check:campaign-policy

if git diff --name-only origin/main..HEAD | grep -q '^server/.whatsapp-fallback-campaigns.json$'; then
  if [[ "${CONFIRM_CAMPAIGN_FALLBACK_CHANGES:-}" != "YES" ]]; then
    echo "Alteracao em campanhas criticas detectada (server/.whatsapp-fallback-campaigns.json)."
    echo "Revise o diff e publique apenas com confirmacao explicita:"
    echo "CONFIRM_CAMPAIGN_FALLBACK_CHANGES=YES ALLOW_REMOTE_PUBLISH=YES LOCAL_ONLY=0 bash scripts/ship-all.sh"
    exit 1
  fi
fi

echo "[5/7] Commits que serao publicados:"
if git log --oneline origin/main..HEAD | cat; then
  :
fi

if [[ -z "$(git log --oneline origin/main..HEAD)" ]]; then
  echo "Nada para publicar: main local ja esta sincronizada com origin/main."
  exit 0
fi

echo "[6/7] Publicando HEAD atual em origin/main..."
git push origin HEAD:main

echo "[7/7] Publicacao concluida com sucesso."
git --no-pager status --short --branch
