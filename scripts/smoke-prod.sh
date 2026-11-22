#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SMOKE_PROJECT="${SMOKE_PROJECT:-meister-smoke-prod}"
DOMAIN="${DOMAIN:-localhost}"
PROXY_HTTP_PORT="${PROXY_HTTP_PORT:-18080}"
PROXY_HTTPS_PORT="${PROXY_HTTPS_PORT:-18443}"

# Evita que variáveis exportadas no shell poluam o teste determinístico
unset TRUST_PROXY APP_URL CORS_ORIGINS PLUGGY_CLIENT_ID PLUGGY_CLIENT_SECRET PLUGGY_WEBHOOK_SECRET \
  PLUGGY_BASE_URL OPENFINANCE_SYNC_INTERVAL_HOURS TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET DEMO_MODE NODE_ENV

TMP_DIR="$(mktemp -d)"
SMOKE_OVERRIDE="$TMP_DIR/smoke-override.yml"
SMOKE_ENV="$TMP_DIR/smoke.env"

cleanup() {
  docker compose -p "$SMOKE_PROJECT" --env-file "$SMOKE_ENV" \
    -f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.prod.yml" -f "$SMOKE_OVERRIDE" \
    down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cat <<EOF > "$SMOKE_OVERRIDE"
services:
  db:
    container_name: ${SMOKE_PROJECT}-db
    ports: !reset []
  api:
    ports: !reset []
EOF

cat <<EOF > "$SMOKE_ENV"
NODE_ENV=production
DOMAIN=${DOMAIN}
PROXY_HTTP_PORT=${PROXY_HTTP_PORT}
PROXY_HTTPS_PORT=${PROXY_HTTPS_PORT}
POSTGRES_USER=meister
POSTGRES_PASSWORD=smoke_prod_postgres_secret_value_123
POSTGRES_DB=meister_smoke
JWT_SECRET=smoke_prod_jwt_secret_value_with_minimum_32_characters
INTERNAL_TICK_SECRET=smoke_prod_tick_secret_value_with_minimum_32_characters
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
EOF

compose_cmd() {
  docker compose -p "$SMOKE_PROJECT" --env-file "$SMOKE_ENV" \
    -f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.prod.yml" -f "$SMOKE_OVERRIDE" "$@"
}

# Pré-verificação TDD: falha claramente se frontend, proxy ou cron não existirem no compose de produção
SERVICES="$(compose_cmd config --services)"
MISSING_SERVICES=()
for svc in frontend proxy cron; do
  if ! printf '%s\n' "$SERVICES" | grep -qx "$svc"; then
    MISSING_SERVICES+=("$svc")
  fi
done

if [ "${#MISSING_SERVICES[@]}" -gt 0 ]; then
  echo "ERRO: Serviços de produção ausentes no docker-compose.prod.yml: ${MISSING_SERVICES[*]}" >&2
  echo "Serviços encontrados:" >&2
  printf '  - %s\n' $SERVICES >&2
  exit 1
fi

echo "==> Subindo stack de produção isolado (${SMOKE_PROJECT})..."
compose_cmd up -d --build db migrate api frontend proxy cron

BASE_URL="https://${DOMAIN}:${PROXY_HTTPS_PORT}"
CURL_COMMON=(-skS --connect-timeout 5 --max-time 15 --resolve "${DOMAIN}:${PROXY_HTTPS_PORT}:127.0.0.1")

echo "==> Aguardando ${BASE_URL}/health/ready..."
READY=0
for _ in $(seq 1 60); do
  if curl -skf --connect-timeout 5 --max-time 5 --resolve "${DOMAIN}:${PROXY_HTTPS_PORT}:127.0.0.1" \
    "${BASE_URL}/health/ready" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "ERRO: Timeout aguardando ${BASE_URL}/health/ready" >&2
  compose_cmd ps >&2 || true
  compose_cmd logs --tail=60 proxy api frontend >&2 || true
  exit 1
fi

# Check 1: GET / (HTML + cabeçalhos de segurança + ausência de COOP/COEP/CSP)
ROOT_HEADERS="$TMP_DIR/root.headers"
ROOT_HTML="$TMP_DIR/root.html"
ROOT_STATUS="$(curl "${CURL_COMMON[@]}" -D "$ROOT_HEADERS" -o "$ROOT_HTML" -w '%{http_code}' "${BASE_URL}/")"
[ "$ROOT_STATUS" = "200" ] || { echo "ERRO: GET / retornou HTTP $ROOT_STATUS" >&2; exit 1; }

ROOT_HEADERS="$ROOT_HEADERS" ROOT_HTML="$ROOT_HTML" node - <<'NODE'
const fs = require('node:fs');

const html = fs.readFileSync(process.env.ROOT_HTML, 'utf8');
if (!/<!doctype html>/i.test(html) || !html.includes('<div id="root">')) {
  throw new Error('GET / não devolveu o HTML esperado do app React');
}

const rawHeaders = fs.readFileSync(process.env.ROOT_HEADERS, 'utf8');
const headerMap = new Map();
for (const line of rawHeaders.split(/\r?\n/)) {
  const idx = line.indexOf(':');
  if (idx <= 0) continue;
  const name = line.slice(0, idx).trim().toLowerCase();
  const value = line.slice(idx + 1).trim();
  const list = headerMap.get(name) ?? [];
  list.push(value);
  headerMap.set(name, list);
}

const required = [
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cache-control',
];
for (const h of required) {
  if (!headerMap.has(h)) {
    throw new Error(`Cabeçalho obrigatório ausente em GET /: ${h}`);
  }
}

if (headerMap.get('x-content-type-options')[0].toLowerCase() !== 'nosniff') {
  throw new Error(`X-Content-Type-Options inesperado: ${headerMap.get('x-content-type-options')[0]}`);
}
if (headerMap.get('x-frame-options')[0].toUpperCase() !== 'SAMEORIGIN') {
  throw new Error(`X-Frame-Options inesperado: ${headerMap.get('x-frame-options')[0]}`);
}
if (!headerMap.get('cache-control').some((v) => v.toLowerCase().includes('no-cache'))) {
  throw new Error(`Cache-Control em GET / deveria conter no-cache: ${headerMap.get('cache-control').join(', ')}`);
}
if (headerMap.has('server') && headerMap.get('server').some((v) => /caddy/i.test(v))) {
  throw new Error(`Cabeçalho Server expõe Caddy: ${headerMap.get('server').join(', ')}`);
}

const forbidden = [
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'content-security-policy',
];
for (const h of forbidden) {
  if (headerMap.has(h)) {
    throw new Error(`Cabeçalho proibido presente em GET /: ${h}`);
  }
}
NODE
echo "OK [1/8] GET / -> 200 HTML, cabeçalhos validados, sem COOP/COEP/CSP."

# Check 2: Fallback SPA
SPA_HTML="$TMP_DIR/spa.html"
SPA_STATUS="$(curl "${CURL_COMMON[@]}" -o "$SPA_HTML" -w '%{http_code}' "${BASE_URL}/rota-qualquer-do-spa")"
[ "$SPA_STATUS" = "200" ] || { echo "ERRO: GET /rota-qualquer-do-spa retornou HTTP $SPA_STATUS" >&2; exit 1; }
cmp -s "$ROOT_HTML" "$SPA_HTML" || { echo "ERRO: Fallback SPA difere de GET /" >&2; exit 1; }
echo "OK [2/8] GET /rota-qualquer-do-spa -> 200 idêntico ao /index.html."

# Check 3: Service Worker com Cache-Control: no-cache
SW_HEADERS="$TMP_DIR/sw.headers"
SW_STATUS="$(curl "${CURL_COMMON[@]}" -D "$SW_HEADERS" -o /dev/null -w '%{http_code}' "${BASE_URL}/sw.js")"
[ "$SW_STATUS" = "200" ] || { echo "ERRO: GET /sw.js retornou HTTP $SW_STATUS" >&2; exit 1; }
if ! grep -qi '^cache-control:.*no-cache' "$SW_HEADERS"; then
  echo "ERRO: GET /sw.js sem Cache-Control: no-cache" >&2
  exit 1
fi
echo "OK [3/8] GET /sw.js -> 200 com Cache-Control: no-cache."

# Check 4: /health/ready, /health/live, /health sem cabeçalhos duplicados com Helmet
HEALTH_HEADERS="$TMP_DIR/health.headers"
HEALTH_BODY="$TMP_DIR/health.json"
HEALTH_STATUS="$(curl "${CURL_COMMON[@]}" -D "$HEALTH_HEADERS" -o "$HEALTH_BODY" -w '%{http_code}' "${BASE_URL}/health/ready")"
[ "$HEALTH_STATUS" = "200" ] || { echo "ERRO: GET /health/ready retornou HTTP $HEALTH_STATUS" >&2; exit 1; }

HEALTH_HEADERS="$HEALTH_HEADERS" HEALTH_BODY="$HEALTH_BODY" node - <<'NODE'
const fs = require('node:fs');

const body = JSON.parse(fs.readFileSync(process.env.HEALTH_BODY, 'utf8'));
if (body.status !== 'ready' || body.database !== 'up') {
  throw new Error(`Payload inesperado de /health/ready: ${JSON.stringify(body)}`);
}

const rawHeaders = fs.readFileSync(process.env.HEALTH_HEADERS, 'utf8');
const counts = new Map();
for (const line of rawHeaders.split(/\r?\n/)) {
  const idx = line.indexOf(':');
  if (idx <= 0) continue;
  const name = line.slice(0, idx).trim().toLowerCase();
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

for (const h of [
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
]) {
  const count = counts.get(h) ?? 0;
  if (count > 1) {
    throw new Error(`Cabeçalho duplicado em /health/ready: ${h} apareceu ${count} vezes`);
  }
}
NODE

LIVE_STATUS="$(curl "${CURL_COMMON[@]}" -o /dev/null -w '%{http_code}' "${BASE_URL}/health/live")"
[ "$LIVE_STATUS" = "200" ] || { echo "ERRO: GET /health/live retornou HTTP $LIVE_STATUS" >&2; exit 1; }
ROOT_HEALTH_STATUS="$(curl "${CURL_COMMON[@]}" -o /dev/null -w '%{http_code}' "${BASE_URL}/health")"
[ "$ROOT_HEALTH_STATUS" = "200" ] || { echo "ERRO: GET /health retornou HTTP $ROOT_HEALTH_STATUS" >&2; exit 1; }
echo "OK [4/8] /health/ready, /health/live e /health -> 200 sem cabeçalhos duplicados."

# Check 5: POST /telegram/webhook sem segredo -> 401/403
TG_STATUS="$(curl "${CURL_COMMON[@]}" -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{"update_id":1}' "${BASE_URL}/telegram/webhook")"
if [ "$TG_STATUS" != "401" ] && [ "$TG_STATUS" != "403" ]; then
  echo "ERRO: POST /telegram/webhook sem segredo retornou HTTP $TG_STATUS (esperado 401 ou 403)" >&2
  exit 1
fi
echo "OK [5/8] POST /telegram/webhook sem segredo -> HTTP $TG_STATUS."

# Check 6: Registro + Login + GET /api/openfinance/config em HTTPS
SMOKE_EMAIL="smoke-prod-$(date +%s)-$$@example.com"
SMOKE_PASS="SmokeProdVerifyPassword!123"
REG_STATUS="$(curl "${CURL_COMMON[@]}" -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Prod\",\"email\":\"${SMOKE_EMAIL}\",\"password\":\"${SMOKE_PASS}\",\"accountType\":\"mei\"}" \
  "${BASE_URL}/api/register")"
[ "$REG_STATUS" = "201" ] || { echo "ERRO: POST /api/register retornou HTTP $REG_STATUS" >&2; exit 1; }

LOGIN_JSON="$TMP_DIR/login.json"
LOGIN_STATUS="$(curl "${CURL_COMMON[@]}" -o "$LOGIN_JSON" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${SMOKE_EMAIL}\",\"password\":\"${SMOKE_PASS}\"}" \
  "${BASE_URL}/api/login")"
[ "$LOGIN_STATUS" = "200" ] || { echo "ERRO: POST /api/login retornou HTTP $LOGIN_STATUS" >&2; exit 1; }

TOKEN="$(LOGIN_JSON="$LOGIN_JSON" node -e "const d=JSON.parse(require('fs').readFileSync(process.env.LOGIN_JSON,'utf8')); if(!d.token) process.exit(1); process.stdout.write(d.token);")"

OF_BODY="$TMP_DIR/openfinance.json"
OF_STATUS="$(curl "${CURL_COMMON[@]}" -o "$OF_BODY" -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" "${BASE_URL}/api/openfinance/config")"
[ "$OF_STATUS" = "200" ] || { echo "ERRO: GET /api/openfinance/config retornou HTTP $OF_STATUS" >&2; exit 1; }
OF_BODY="$OF_BODY" node -e "const d=JSON.parse(require('fs').readFileSync(process.env.OF_BODY,'utf8')); if(d.hasCredentials!==false) throw new Error(JSON.stringify(d));"
echo "OK [6/8] Registro, login e GET /api/openfinance/config via HTTPS -> HTTP 200."

# Check 7: Anti-spoofing de X-Forwarded-For + TRUST_PROXY=uniquelocal (cliente != container proxy)
PROXY_CID="$(compose_cmd ps -q proxy)"
[ -n "$PROXY_CID" ] || { echo "ERRO: Não foi possível obter o container ID do serviço proxy" >&2; exit 1; }
PROXY_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$PROXY_CID" | tr -d '[:space:]')"
[ -n "$PROXY_IP" ] || { echo "ERRO: Não foi possível obter o IP interno do container proxy" >&2; exit 1; }

CONSENT_BODY="$TMP_DIR/consent.json"
CONSENT_STATUS="$(curl "${CURL_COMMON[@]}" -o "$CONSENT_BODY" -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 203.0.113.99, 198.51.100.77' \
  -d '{"kind":"terms","version":"smoke-1.0","accepted":true}' \
  "${BASE_URL}/api/consents")"
[ "$CONSENT_STATUS" = "200" ] || { echo "ERRO: POST /api/consents retornou HTTP $CONSENT_STATUS" >&2; exit 1; }

IP_RECORDED="$(CONSENT_BODY="$CONSENT_BODY" PROXY_IP="$PROXY_IP" node - <<'NODE'
const fs = require('node:fs');
const body = JSON.parse(fs.readFileSync(process.env.CONSENT_BODY, 'utf8'));
const proxyIp = process.env.PROXY_IP;
const ip = body.ipAddress;
if (typeof ip !== 'string' || ip.trim() === '') {
  throw new Error(`ipAddress ausente em POST /api/consents: ${JSON.stringify(body)}`);
}
if (ip.includes('203.0.113.99') || ip.includes('198.51.100.77') || ip.includes(',')) {
  throw new Error(`X-Forwarded-For forjado vazou para a API: ipAddress="${ip}"`);
}
if (ip === proxyIp) {
  throw new Error(
    `API registrou o IP do container proxy ("${proxyIp}") em vez do IP do cliente — verifique TRUST_PROXY=uniquelocal`
  );
}
process.stdout.write(ip);
NODE
)"
echo "OK [7/8] X-Forwarded-For forjado sobrescrito pelo Caddy e TRUST_PROXY ativo (cliente=${IP_RECORDED}, proxy=${PROXY_IP})."

# Check 8: /api/internal/* bloqueado externamente no Caddy (404) e serviço cron chama POST /api/internal/tick na rede interna (200)
TICK_EXT_STATUS="$(curl "${CURL_COMMON[@]}" -o /dev/null -w '%{http_code}' -X POST \
  -H 'X-Internal-Secret: smoke_prod_tick_secret_value_with_minimum_32_characters' \
  "${BASE_URL}/api/internal/tick")"
[ "$TICK_EXT_STATUS" = "404" ] || { echo "ERRO: POST /api/internal/tick via Caddy retornou HTTP $TICK_EXT_STATUS (esperado 404)" >&2; exit 1; }

CRON_TICK_OUT="$(compose_cmd exec -T cron /usr/local/bin/tick.sh 2>&1)" || {
  echo "ERRO: Execução de /usr/local/bin/tick.sh no container cron falhou:" >&2
  printf '%s\n' "$CRON_TICK_OUT" >&2
  exit 1
}
if ! printf '%s\n' "$CRON_TICK_OUT" | grep -q 'HTTP 200'; then
  echo "ERRO: tick.sh não retornou HTTP 200 esperado: $CRON_TICK_OUT" >&2
  exit 1
fi
if printf '%s\n' "$CRON_TICK_OUT" | grep -q 'smoke_prod_tick_secret_value'; then
  echo "ERRO: segredo interno vazou na saída do cron" >&2
  exit 1
fi
echo "OK [8/8] /api/internal/tick bloqueado no Caddy (404) e executado via rede interna pelo cron (HTTP 200)."
echo "SUCESSO: Todos os 8 checks do smoke test de produção passaram em ${BASE_URL}."
