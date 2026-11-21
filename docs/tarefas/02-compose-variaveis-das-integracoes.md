# 02 — Repassar as variáveis das integrações no docker-compose

**Prioridade:** 🔴 bloqueador de produção
**Dono:** DevOps
**Branch sugerida:** `fix/compose-variaveis-integracoes`

## Problema

O serviço `api` do `docker-compose.yml` só recebe `NODE_ENV`, `PORT`, `HOST`, `DATABASE_URL`,
`JWT_SECRET`, `CORS_ORIGINS`, `APP_URL` e `INTERNAL_TICK_SECRET`. As chaves das integrações
**não chegam ao container**:

- `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`
- `GEMINI_API_KEY`, `LLM_MODEL`, `NARRATION_MODE`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MODE`, `TELEGRAM_WEBHOOK_SECRET`
- `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`
- `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`, `LOCK_TIME_MINUTES`, `LOGIN_MAX_ATTEMPTS_*`, `REQUIRE_EMAIL_VERIFICATION`
- `MEI_ANNUAL_LIMIT`, `DEFAULT_TIMEZONE`, `DEMO_MODE`

Como todas são opcionais no `backend/src/shared/env.ts`, a API sobe "saudável" com Open Finance,
IA e Telegram desligados, sem erro nenhum. Em produção isso passa despercebido.

## Onde

- `docker-compose.yml`, serviço `api`, bloco `environment`.
- `.env.example`, que é a lista de referência das variáveis.
- `backend/src/shared/env.ts`, que é o schema validado no boot.

## O que fazer

1. Repasse **todas** as variáveis do `.env.example` que o backend lê para o serviço `api`
   (`VAR: ${VAR:-}` para opcionais; `${VAR:?defina VAR}` só para as obrigatórias).
   Alternativa aceitável: `env_file: .env` + sobrescrever só `DATABASE_URL` (que precisa apontar para `db`).
   Escolha uma e justifique no PR.
2. Crie um `docker-compose.prod.yml` (ou documente no README) com o que muda em produção:
   `NODE_ENV=production`, `TELEGRAM_MODE=webhook`, `EMAIL_PROVIDER` real, `DEMO_MODE=false`.
3. **Pedir ao Backend** (não implemente se for `backend/src/**`): um aviso no log de boot, sem
   valores, dizendo quais integrações estão desligadas por falta de variável. Ex.:
   `integrações desligadas: pluggy, telegram`. Registre isso no PR como pendência para o agente de backend.

## Teste que deve falhar antes

Script de verificação (pode ficar em `scripts/check-compose-env.sh` e rodar no CI):

- Extraia os nomes do `.env.example` e os nomes repassados em `docker compose config` para o serviço `api`.
- Falhe se alguma variável lida em `env.ts` não estiver no compose.

Rode antes da correção e cole a lista de faltantes no PR.

## Critério de pronto

- [ ] `docker compose config` mostra todas as variáveis do backend no serviço `api`.
- [ ] Subindo com um `.env` contendo `PLUGGY_CLIENT_ID/SECRET`, `GET /api/openfinance/config` responde `hasCredentials: true`.
- [ ] Verificação no CI impede regressão.
- [ ] Tabela do `README.md` desta pasta atualizada.
