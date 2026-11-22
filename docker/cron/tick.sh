#!/bin/sh
set -eu

if [ -z "${INTERNAL_TICK_SECRET:-}" ]; then
  echo "[cron-tick] ERRO: INTERNAL_TICK_SECRET não definido." >&2
  exit 1
fi

API_TICK_URL="${API_TICK_URL:-http://api:3000/api/internal/tick}"

umask 077
TMP_CFG="$(mktemp)"
TMP_BODY="$(mktemp)"
cleanup() {
  rm -f "$TMP_CFG" "$TMP_BODY"
}
trap cleanup EXIT

ESCAPED_SECRET="$(printf '%s' "$INTERNAL_TICK_SECRET" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf 'header = "X-Internal-Secret: %s"\n' "$ESCAPED_SECRET" > "$TMP_CFG"

CURL_RC=0
HTTP_CODE="$(
  curl -sS \
    --connect-timeout 5 \
    --max-time 300 \
    -X POST \
    -K "$TMP_CFG" \
    -o "$TMP_BODY" \
    -w '%{http_code}' \
    "$API_TICK_URL"
)" || CURL_RC=$?

if [ "$CURL_RC" -ne 0 ]; then
  echo "[cron-tick] ERRO: falha na chamada ao tick interno (curl exit ${CURL_RC})." >&2
  exit 1
fi

case "$HTTP_CODE" in
  200)
    SUMMARY="$(tr -d '\r\n' < "$TMP_BODY")"
    echo "[cron-tick] HTTP 200 ${SUMMARY}"
    exit 0
    ;;
  409)
    echo "[cron-tick] HTTP 409 execução já em andamento; ciclo atual ignorado."
    exit 0
    ;;
  *)
    echo "[cron-tick] ERRO: resposta inesperada HTTP ${HTTP_CODE}." >&2
    exit 1
    ;;
esac
