# 03 — Publicar o frontend com proxy reverso e HTTPS

**Prioridade:** 🔴 bloqueador de produção
**Dono:** DevOps
**Branch sugerida:** `feat/deploy-frontend-caddy`

## Problema

Não existe forma de servir o frontend em produção:

- Não há `frontend/Dockerfile`.
- Não há proxy reverso. O `CLAUDE.md` cita Caddy, mas não existe `Caddyfile` nem `docker/`.
- O frontend chama a API em caminho relativo (`frontend/src/api/client.ts:4`, `baseURL: '/api'`).
  Em dev quem resolve isso é o proxy do Vite (`frontend/vite.config.ts`); em produção alguém precisa
  encaminhar `/api/*` para o backend no **mesmo domínio**.
- O webhook do Telegram fica fora de `/api` (`backend/src/app.ts:90`, `telegramWebhookRoute`) e
  também precisa ser encaminhado.
- Webhooks (Telegram, Pluggy na tarefa 09) exigem HTTPS público.

## O que fazer

1. `frontend/Dockerfile` multi-stage: `node:22-alpine` roda `npm ci && npm run build`; a imagem final
   só serve `dist/` (Caddy ou nginx). SPA: qualquer rota desconhecida devolve `index.html`.
2. Serviço `proxy` (Caddy) no compose de produção:
   - `https://<dominio>` → arquivos do frontend.
   - `/api/*` → `api:3000` (sem remover o prefixo, o backend já registra com `/api`).
   - `/health/ready` fica fora de `/api` (`backend/src/app.ts`) — o proxy precisa encaminhá-lo para `api:3000` ou o teste de fumaça deve chamar a API diretamente.
   - Rota do webhook do Telegram (`POST /telegram/webhook`) → `api:3000`.
   - TLS automático (Let's Encrypt) via variável `DOMAIN`.
   - Cabeçalhos de segurança (HSTS etc.) sem duplicar o que o `helmet` do backend já envia.
3. Ajuste `APP_URL` e `CORS_ORIGINS` para o domínio público. Com o mesmo domínio, o CORS fica
   praticamente sem uso, mas o valor precisa estar certo.
4. A API e o banco **não** devem ficar expostos publicamente (hoje estão em `127.0.0.1`, mantenha).
5. Documente no README: como subir em produção, variáveis obrigatórias, como renovar o certificado.
6. Se for usar um serviço gerenciado (Render, Fly, VPS), descreva o passo a passo em `docs/deploy.md`.

## Teste que deve falhar antes

Teste de fumaça (`scripts/smoke-prod.sh`), rodando contra o compose de produção local
(`DOMAIN=localhost`, TLS interno do Caddy):

- `GET /` → 200 com o HTML do app.
- `GET /rota-qualquer-do-spa` → 200 com o mesmo `index.html`.
- `GET /health/ready` → 200 (rota fora de `/api`: encaminhada pelo proxy ou chamada direto na API).
- `POST` na rota do webhook do Telegram sem o segredo → 401/403 (prova que chega ao backend).

Hoje o script falha por não haver serviço nenhum. Cole a saída no PR.

## Critério de pronto

- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up` sobe proxy, frontend, api, db e migrate.
- [ ] Smoke test verde.
- [ ] Login funciona pelo domínio em HTTPS (autenticação atual usa Bearer token em `localStorage`; não há cookie de refresh implementado).
- [ ] README/`docs/deploy.md` com o passo a passo.
- [ ] Tabela do `README.md` desta pasta atualizada.
