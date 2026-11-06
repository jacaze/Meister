#!/usr/bin/env bash
# Sobe Postgres descartável, aplica migrations (como o CI), roda as provas e remove o banco.
# Uso: bash .claude/hardening/ledger/probes/run.sh   (a partir da raiz do Meister-main)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
NAME=meister-ledger-probe-db; PORT=55442
docker rm -f $NAME >/dev/null 2>&1 || true
docker run -d --rm --name $NAME -e POSTGRES_USER=meister -e POSTGRES_PASSWORD=probe_only_pw -e POSTGRES_DB=meister_probe -p 127.0.0.1:$PORT:5432 postgres:16-alpine >/dev/null
trap 'docker rm -f $NAME >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do docker exec $NAME pg_isready -U meister -d meister_probe >/dev/null 2>&1 && break; sleep 1; done
export DATABASE_URL="postgresql://meister:probe_only_pw@127.0.0.1:$PORT/meister_probe?schema=public" DIRECT_URL="postgresql://meister:probe_only_pw@127.0.0.1:$PORT/meister_probe?schema=public"
export NODE_ENV=test
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
cd "$ROOT/backend"
npx prisma migrate deploy >/dev/null
echo "== commit $(git rev-parse --short HEAD) | TZ do processo: $(date +%Z)"
npx tsx "$HERE/ledger-probe.mts"
echo "== P-C2 (timestamp sem offset) em dois fusos"
for tz in UTC America/Sao_Paulo; do TZ=$tz npx tsx "$HERE/clock-probe.mts" | sed "s|^|[TZ=$tz] |"; done
