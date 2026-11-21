# Guia de Deploy em Produção — MEIster

Este documento descreve como publicar o **MEIster** em produção com HTTPS automático, proxy reverso único no mesmo domínio e isolamento de banco e API.

---

## 1. Arquitetura de Produção

O stack de produção (`docker-compose.yml` + `docker-compose.prod.yml`) executa:

- **`proxy` (`caddy:2.11-alpine`)**: único ponto exposto nas portas `80` e `443` (`PROXY_HTTP_PORT` / `PROXY_HTTPS_PORT`), com TLS automático via Let's Encrypt para `DOMAIN` (ou TLS interno quando `DOMAIN=localhost`).
  - `/api/*` → `api:3000` (preserva o prefixo `/api`)
  - `/health`, `/health/*` (`/health/live`, `/health/ready`) → `api:3000`
  - `POST /telegram/webhook` → `api:3000`
  - Demais rotas → `frontend:8080`
- **`frontend` (`frontend/Dockerfile` — `node:22-alpine` → `caddy:2.11-alpine`)**: serve o build estático do Vite (`dist/`) apenas na rede interna do Docker (`expose: 8080`), com fallback SPA para `/index.html` e os cabeçalhos PWA (`/sw.js` `no-cache`, `/assets/*` `immutable`).
- **`api` (`backend/Dockerfile`)**: escuta em `3000`, ligado no host apenas a `127.0.0.1:3000` (nunca exposto externamente).
- **`db` (`postgres:16-alpine`) + `migrate`**: escuta na rede interna e em `127.0.0.1:5436`.

> **Confiança no proxy (`TRUST_PROXY`):**
> O `docker-compose.prod.yml` define `TRUST_PROXY=uniquelocal` no serviço `api` (introduzido pela Tarefa 13 / PR #9), fazendo o Fastify confiar apenas nos proxies da rede privada do Docker (`proxy` Caddy) para o rate limit global (`300 req/min` por cliente real) e registro de IP de consentimento LGPD. Como `docker/Caddyfile` não define `trusted_proxies`, o Caddy descarta qualquer `X-Forwarded-For` enviado pelo cliente e repassa somente o IP real da conexão TCP.

---

## 2. Opção A — VPS / Servidor Docker (Recomendada)

### Pré-requisitos

- Servidor Linux com Docker Engine + Docker Compose v2.
- Domínio apontado para o IP público do servidor (registros DNS `A` / `AAAA`).
- Firewall liberando **TCP 80** e **TCP 443** (portas `5436` e `3000` **não** devem ser liberadas).

### Passo a passo

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/jacaze/Meister.git
   cd Meister
   ```

2. **Criar e preencher o `.env` de produção na raiz do projeto** (a partir de `.env.example`):
   ```bash
   cp .env.example .env
   ```
   Variáveis obrigatórias e críticas para produção:
   - `DOMAIN=app.seudominio.com.br` (sem `https://`)
   - `POSTGRES_PASSWORD` (senha forte aleatória; nunca usar `change_me` ou `dev_only`)
   - `JWT_SECRET` (mínimo 32 caracteres aleatórios — ex.: `openssl rand -base64 48`)
   - `INTERNAL_TICK_SECRET` (mínimo 32 caracteres aleatórios)
   - Integrações conforme uso:
     - `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` (ambas juntas ou ambas vazias; se `PLUGGY_BASE_URL` for usada, precisa começar com `https://`)
     - `GEMINI_API_KEY` (opcional; sem ela usa fallback determinístico/template)
     - `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` (obrigatório ter mínimo 16 caracteres quando `TELEGRAM_BOT_TOKEN` estiver definido em produção, pois `docker-compose.prod.yml` define `TELEGRAM_MODE=webhook`)

   > `APP_URL` e `CORS_ORIGINS` são definidos automaticamente em `docker-compose.prod.yml` como `https://${DOMAIN:-localhost}`.

3. **Subir os serviços:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

4. **Verificar saúde e logs:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   curl -fsS https://app.seudominio.com.br/health/ready
   ```

5. **Conferir após o primeiro deploy se o IP gravado pela API é o IP público do cliente (e não `172.x.0.1`):**
   - Faça um acesso a partir de uma rede externa (por exemplo, registrando um consentimento autenticado em `POST /api/consents` ou inspecionando `request.ip` nos logs da `api`) e confirme que o IP gravado pela API é o **IP público real do cliente**, e não o gateway interno da bridge Docker (`172.x.0.1`).
   - Se o IP gravado for `172.x.0.1`, o tráfego está sofrendo SNAT pelo `userland-proxy` do Docker (ou entrando via IPv6 sem `ip6tables`). Ajuste `/etc/docker/daemon.json` na VPS, reinicie o serviço Docker e repita a checagem:
     ```json
     {
       "userland-proxy": false,
       "ip6tables": true
     }
     ```
     ```bash
     sudo systemctl restart docker
     ```

6. **Validar localmente (sem afetar banco existente):**
   O script [`scripts/smoke-prod.sh`](../scripts/smoke-prod.sh) sobe uma instância isolada com `DOMAIN=localhost` (portas altas `18080`/`18443` por padrão) e verifica SPA, Service Worker, `/health/ready`, ausência de cabeçalhos duplicados/COOP/COEP/CSP, `POST /telegram/webhook`, registro/login em HTTPS e sobrescrita de `X-Forwarded-For` pelo Caddy:
   ```bash
   ./scripts/smoke-prod.sh
   ```

---

## 3. Certificados HTTPS (Let's Encrypt) e Renovação

- **Emissão e renovação automáticas:** o Caddy solicita o certificado TLS via ACME (HTTP-01 / TLS-ALPN-01) automaticamente no primeiro acesso usando `DOMAIN` e o **renova em segundo plano** antes do vencimento (por volta de 2/3 da validade de 90 dias). Não há cron externo necessário.
- **Persistência obrigatória:** os volumes nomeados `caddy_data` (`/data`) e `caddy_config` (`/config`) armazenam certificados e chaves privadas. **Nunca** execute `docker compose down -v` em produção, pois `-v` apaga os volumes do banco (`pgdata`) e dos certificados (`caddy_data`).
- **Inspecionar emissão/renovação:**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f proxy
  ```
- **Se usar Cloudflare / CDN na frente do Caddy:** o proxy da CDN substitui o peer direto da conexão TCP. Nesse cenário, avalie configurar `trusted_proxies` no `docker/Caddyfile` apenas para os blocos de IP da CDN para preservar o IP real do cliente (além do `trustProxy` no Fastify).

---

## 4. Opção B — Serviços Gerenciados (Render / Fly.io)

Se optar por hospedar fora de uma VPS única, mantenha os mesmos invariantes de domínio único e rotas:

1. **Banco PostgreSQL gerenciado** (PostgreSQL 16): copie a `DATABASE_URL` para o backend e execute `npx prisma migrate deploy` no release/pre-deploy command.
2. **Backend (`backend/Dockerfile`)**:
   - Suba `node dist/main-api.js` na porta interna `3000` sem expor o banco publicamente.
   - Configure as mesmas variáveis obrigatórias de ambiente (`NODE_ENV=production`, `JWT_SECRET`, `INTERNAL_TICK_SECRET`, `APP_URL`, `CORS_ORIGINS`, chaves de integração).
3. **Frontend (`frontend/Dockerfile`) + Roteamento no mesmo domínio**:
   - **No Render:** publique o frontend (`dist/`) e configure **Rewrite/Proxy Rules** no serviço web ou edge para encaminhar `/api/*`, `/health/*` (e `/health`) e `POST /telegram/webhook` para a URL interna do serviço backend, com fallback `/* -> /index.html` apenas para rotas do app.
   - **No Fly.io:** use dois apps internos (ou processo único com `proxy` Caddy na frente do frontend e da API dentro da rede privada `.internal`), expondo apenas o proxy HTTPS da Fly (que já termina TLS automaticamente).
4. **Atenção ao CORS e SPA:** como o frontend usa `baseURL: '/api'`, encaminhar `/api/*`, `/health/*` e `POST /telegram/webhook` sob o **mesmo domínio HTTPS** elimina CORS cross-site e garante o funcionamento dos webhooks.
