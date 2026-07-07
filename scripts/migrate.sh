#!/usr/bin/env bash
set -e

ENV=${1:-""}
DEV_REF="swtmhukcwtuvsvmlncrq"
PREVIEW_REF="ulmmlcxnogtyjmuiukew"

if [ -z "$ENV" ]; then
  echo "Usage: ./scripts/migrate.sh dev|preview"
  exit 1
fi

TOKEN=$(security find-generic-password -s "supabase-cli" -a "alinea" -w)

case "$ENV" in
  dev)
    REF="$DEV_REF"
    ;;
  preview)
    if [ -z "$PREVIEW_REF" ]; then
      echo "PREVIEW_REF non défini dans scripts/migrate.sh"
      exit 1
    fi
    REF="$PREVIEW_REF"
    ;;
  *)
    echo "Environnement inconnu : $ENV (dev ou preview)"
    exit 1
    ;;
esac

echo "→ Link sur $ENV ($REF)…"
SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase link --project-ref "$REF"

echo "→ db push sur $ENV…"
SUPABASE_ACCESS_TOKEN="$TOKEN" npx supabase db push

echo "✓ Migrations appliquées sur $ENV"
