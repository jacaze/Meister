#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Remove variáveis da aplicação do ambiente atual para validar os defaults puros do compose
while IFS= read -r var; do
  [ -n "$var" ] && unset "$var"
done < <(
  {
    grep -oE '^[A-Z][A-Z0-9_]*=' "$ROOT_DIR/.env.example" | sed 's/=$//' || true
    grep -oE '^    [A-Z][A-Z0-9_]*:' "$ROOT_DIR/backend/src/shared/env.ts" | sed -E 's/^    ([A-Z][A-Z0-9_]*):/\1/' || true
  } | sort -u
)

# Valores fictícios (sem padrões de segredo fraco) apenas para renderizar docker compose config
export POSTGRES_PASSWORD="compose_env_check_postgres_value"
export JWT_SECRET="compose_env_check_jwt_value_with_minimum_32_characters"
export INTERNAL_TICK_SECRET="compose_env_check_tick_value_with_minimum_32_characters"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

BASE_JSON="$TMP_DIR/base.json"
PROD_JSON=""

docker compose --env-file /dev/null -f "$ROOT_DIR/docker-compose.yml" config --format json > "$BASE_JSON"

if [ -f "$ROOT_DIR/docker-compose.prod.yml" ]; then
  PROD_JSON="$TMP_DIR/prod.json"
  docker compose --env-file /dev/null -f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.prod.yml" config --format json > "$PROD_JSON"
fi

ROOT_DIR="$ROOT_DIR" BASE_JSON="$BASE_JSON" PROD_JSON="$PROD_JSON" node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const rootDir = process.env.ROOT_DIR;
const baseJsonPath = process.env.BASE_JSON;
const prodJsonPath = process.env.PROD_JSON;

const envTsPath = path.join(rootDir, 'backend', 'src', 'shared', 'env.ts');
const envExamplePath = path.join(rootDir, '.env.example');

const envTsContent = fs.readFileSync(envTsPath, 'utf8');
const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

// Extrai as chaves do bloco envSchema = z.object({ ... }) antes de .superRefine
const schemaBlockMatch = envTsContent.match(
  /const envSchema = z\s*\.object\(\{([\s\S]*?)\n  \}\)\s*\n  \.superRefine/
);
if (!schemaBlockMatch) {
  console.error('ERRO: Não foi possível localizar o bloco z.object({...}) em backend/src/shared/env.ts');
  process.exit(1);
}

const envTsVars = [];
for (const line of schemaBlockMatch[1].split(/\r?\n/)) {
  const m = line.match(/^\s{4}([A-Z][A-Z0-9_]*)\s*:/);
  if (m) {
    envTsVars.push(m[1]);
  }
}

if (envTsVars.length < 20) {
  console.error(
    `ERRO: Extração de backend/src/shared/env.ts retornou apenas ${envTsVars.length} variáveis (esperado >= 20).`
  );
  process.exit(1);
}

const envExampleVars = [];
for (const line of envExampleContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (m) {
    envExampleVars.push(m[1]);
  }
}

if (envExampleVars.length < 20) {
  console.error(
    `ERRO: Extração de .env.example retornou apenas ${envExampleVars.length} variáveis (esperado >= 20).`
  );
  process.exit(1);
}

// Variáveis exclusivas do container db/proxy/host que não pertencem ao ambiente do serviço api
const HOST_OR_INFRA_ONLY = new Set([
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_PORT',
  'DIRECT_URL',
  'DOMAIN',
  'PROXY_HTTP_PORT',
  'PROXY_HTTPS_PORT',
]);

// Variáveis presentes no .env.example para e-mail transacional ainda não implementado no backend
const UNIMPLEMENTED_EMAIL_VARS = new Set([
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
]);

// Variáveis em env.ts que não podem receber ""/null quando o .env está ausente (evita crash do Zod no boot)
const NON_EMPTY_ENV_VARS = [
  'NODE_ENV',
  'PORT',
  'HOST',
  'APP_URL',
  'CORS_ORIGINS',
  'DEFAULT_TIMEZONE',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_ACCESS_TTL',
  'REFRESH_TTL_DAYS',
  'LOCK_TIME_MINUTES',
  'LOGIN_MAX_ATTEMPTS_PAIR',
  'LOGIN_MAX_ATTEMPTS_ACCOUNT',
  'LOGIN_MAX_ATTEMPTS_IP',
  'REQUIRE_EMAIL_VERIFICATION',
  'MEI_ANNUAL_LIMIT',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_MODE',
  'LLM_MODEL',
  'NARRATION_MODE',
  'OPENFINANCE_SYNC_INTERVAL_HOURS',
  'DEMO_MODE',
];

function loadApiEnv(jsonPath) {
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const apiEnv = parsed?.services?.api?.environment;
  if (!apiEnv || typeof apiEnv !== 'object' || Array.isArray(apiEnv)) {
    throw new Error(`services.api.environment ausente ou inválido em ${jsonPath}`);
  }
  return apiEnv;
}

function validateComposeEnv(label, jsonPath, { expectProd }) {
  const apiEnv = loadApiEnv(jsonPath);
  const errors = [];

  const missingFromEnvTs = envTsVars.filter((v) => !Object.prototype.hasOwnProperty.call(apiEnv, v));
  if (missingFromEnvTs.length > 0) {
    errors.push(
      `Variáveis de backend/src/shared/env.ts ausentes em ${label} (${missingFromEnvTs.length}):\n` +
        missingFromEnvTs.map((v) => `  - ${v}`).join('\n')
    );
  }

  const missingFromExample = envExampleVars.filter(
    (v) =>
      !HOST_OR_INFRA_ONLY.has(v) &&
      !UNIMPLEMENTED_EMAIL_VARS.has(v) &&
      !Object.prototype.hasOwnProperty.call(apiEnv, v)
  );
  if (missingFromExample.length > 0) {
    errors.push(
      `Variáveis de .env.example ausentes em ${label} (${missingFromExample.length}):\n` +
        missingFromExample.map((v) => `  - ${v}`).join('\n')
    );
  }

  const unexpectedEmailVars = [...UNIMPLEMENTED_EMAIL_VARS].filter((v) =>
    Object.prototype.hasOwnProperty.call(apiEnv, v)
  );
  if (unexpectedEmailVars.length > 0) {
    errors.push(
      `Variáveis de e-mail não implementadas no backend não devem constar em ${label}:\n` +
        unexpectedEmailVars.map((v) => `  - ${v}`).join('\n')
    );
  }

  const emptyNonEmptyVars = NON_EMPTY_ENV_VARS.filter((v) => {
    if (!Object.prototype.hasOwnProperty.call(apiEnv, v)) return false;
    const val = apiEnv[v];
    return val === null || val === undefined || String(val).trim() === '';
  });
  if (emptyNonEmptyVars.length > 0) {
    errors.push(
      `Variáveis com validação não-vazia em env.ts resolveram para vazio/null em ${label}:\n` +
        emptyNonEmptyVars.map((v) => `  - ${v}`).join('\n')
    );
  }

  if (expectProd) {
    const prodExpectations = [
      ['NODE_ENV', 'production'],
      ['TRUST_PROXY', 'uniquelocal'],
      ['TELEGRAM_MODE', 'webhook'],
      ['DEMO_MODE', 'false'],
      ['APP_URL', 'https://localhost'],
      ['CORS_ORIGINS', 'https://localhost'],
    ];
    for (const [key, expected] of prodExpectations) {
      const actual = Object.prototype.hasOwnProperty.call(apiEnv, key) ? String(apiEnv[key]) : '<ausente>';
      if (actual !== expected) {
        errors.push(`Override de produção inválido em ${label}: ${key}="${actual}" (esperado "${expected}")`);
      }
    }
  }

  return { errors, totalApiVars: Object.keys(apiEnv).length };
}

const allErrors = [];
const baseResult = validateComposeEnv('docker-compose.yml (services.api)', baseJsonPath, { expectProd: false });
allErrors.push(...baseResult.errors);

let prodResult = null;
if (prodJsonPath) {
  prodResult = validateComposeEnv(
    'docker-compose.yml + docker-compose.prod.yml (services.api)',
    prodJsonPath,
    { expectProd: true }
  );
  allErrors.push(...prodResult.errors);
}

if (allErrors.length > 0) {
  console.error(allErrors.join('\n\n'));
  process.exit(1);
}

console.log(
  `OK: ${envTsVars.length} variáveis de env.ts e ${envExampleVars.length} variáveis de .env.example verificadas.`
);
console.log(`  - docker-compose.yml (services.api): ${baseResult.totalApiVars} variáveis configuradas.`);
if (prodResult) {
  console.log(
    `  - docker-compose.prod.yml (services.api): ${prodResult.totalApiVars} variáveis configuradas (NODE_ENV=production, TRUST_PROXY=uniquelocal, TELEGRAM_MODE=webhook, DEMO_MODE=false, APP_URL=https://localhost, CORS_ORIGINS=https://localhost).`
  );
}
NODE
