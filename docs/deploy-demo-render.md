# Deploy da DEMO — Neon + Render + cron-job.org (custo zero)

Roteiro para hospedar a demonstração da banca sem custo. **Não é produção** (ver "Limitações").
O repositório já traz tudo pronto: `render.yaml` (Blueprint), `backend/Dockerfile` (com o CLI do Prisma fixado) e `scripts/check-render-blueprint.sh` (validação no CI).

Arquitetura:

```
Navegador -> Static Site (Render, meister-web) --/api/* (rewrite)--> Web Service (Render, meister-api) -> Neon (Postgres)
Telegram  -> https://<api>.onrender.com/telegram/webhook
cron-job.org -> POST /api/internal/tick (1x/hora)  e  GET /health (a cada 10 min)
```

O frontend usa `baseURL: '/api'`. O rewrite do Static Site proxia `/api/*` para a API, então para o navegador tudo é a mesma origem: sem CORS cross-site e sem problema de cookies (a API usa tokens em `Authorization`, não cookies de sessão).

## 1. Neon (banco)

1. Crie conta em neon.com e um projeto novo (Postgres 16 ou superior; região mais próxima da região do Render, `oregon` = AWS us-west-2).
2. Em **Connect**, **desmarque** "Connection pooling" e copie a connection string **direta** (host `ep-xxxx.region.aws.neon.tech`, **sem** `-pooler`). Garanta `?sslmode=require` no final.
3. Guarde a string; ela será o `DATABASE_URL`.

Por que a URL direta: as migrations do Prisma exigem conexão direta (a documentação do Neon recomenda conexão direta para migrations e tarefas administrativas; o pooler usa PgBouncer em modo transação). O lock do tick usa `pg_try_advisory_xact_lock` (por transação) e em tese funcionaria no pooler, mas não há ganho para uma demo com poucos acessos, então usamos a direta em tudo.

## 2. Render (API + frontend via Blueprint)

1. Faça push da branch/ revisão que contém `render.yaml` (ex.: `develop` após o merge do PR de deploy).
2. No Render: **New > Blueprint**, conecte o repositório `jacaze/Meister`, escolha a branch e confirme. Serão criados `meister-api` (Web Service Docker, plano Free) e `meister-web` (Static Site).
3. O Render pedirá os valores das variáveis `sync: false` (só na criação; depois edite em **Environment** de cada serviço).
4. Se os nomes `meister-api`/`meister-web` já estiverem em uso, a URL ganhará um sufixo. Nesse caso edite a regra `/api/*` do `meister-web` (aba **Redirects/Rewrites**) e o `render.yaml` para a URL real da API.
5. Depois do primeiro deploy, copie a URL do Static Site (`https://meister-web.onrender.com`) e preencha `APP_URL` e `CORS_ORIGINS` da API (se não souber antes, deixe provisório e corrija; o serviço reinicia).

### Variáveis da API (`meister-api`)

| Variável | Obrigatória | Origem |
|---|---|---|
| `DATABASE_URL` | Sim | URL direta do Neon (sem `-pooler`, com `sslmode=require`) |
| `APP_URL` | Sim | URL pública do Static Site, sem barra final |
| `CORS_ORIGINS` | Sim | A mesma URL do Static Site |
| `JWT_SECRET` | Sim | Gerada pelo Render (`generateValue`, 44 caracteres) |
| `INTERNAL_TICK_SECRET` | Sim | Gerada pelo Render; copie o valor em **Environment** para usar no cron-job.org |
| `TELEGRAM_BOT_TOKEN` | Não (só se usar o bot) | @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Obrigatória se houver token (mínimo 16 caracteres) | Você inventa: `openssl rand -hex 24` |
| `GEMINI_API_KEY` | Não | Sem ela o texto usa o fallback determinístico |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | Não (ambas juntas ou nenhuma) | Painel da Pluggy (use credenciais de sandbox) |
| `PLUGGY_WEBHOOK_SECRET` | Não (mínimo 32 caracteres se definida) | Você inventa |

Já fixas no Blueprint: `NODE_ENV=production`, `HOST=0.0.0.0`, `TRUST_PROXY=uniquelocal`, `DEFAULT_TIMEZONE=America/Sao_Paulo`, `TELEGRAM_MODE=webhook`, `DEMO_MODE=false`, `NARRATION_MODE=auto`. `PORT` é injetado pelo Render (10000) e a API já o respeita.

### Variável do frontend (`meister-web`)

`VITE_PLUGGY_INCLUDE_SANDBOX=true` (variável de build, vinda do PR #23; é inofensiva se o PR ainda não estiver na branch). Alterar exige novo build do Static Site.

### Migrations

O plano Free não tem `preDeployCommand` (é recurso pago). Por isso o comando de start da API é `prisma migrate deploy && node dist/main-api.js`: as migrations rodam a cada start (idempotente; sem migrations pendentes não faz nada). Se falhar, o deploy não sobe e o erro aparece nos logs.

## 3. Webhook do Telegram

Rota real: `POST /telegram/webhook` (na raiz, **não** em `/api`). O segredo vai no header `X-Telegram-Bot-Api-Secret-Token`, comparado com `TELEGRAM_WEBHOOK_SECRET`.

```bash
curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  --data-urlencode "url=https://<api>.onrender.com/telegram/webhook" \
  --data-urlencode "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
curl -sS "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Aponte direto para a API (não para o Static Site). Se a API estiver dormindo, o Telegram reenvia a atualização; o primeiro retorno pode demorar cerca de 1 minuto (cold start).

## 4. cron-job.org (dois jobs)

Crie conta gratuita em cron-job.org e dois jobs:

**(a) Tick horário**
- URL: `https://<api>.onrender.com/api/internal/tick`
- Método: `POST`; agendamento: a cada hora (minuto 0).
- Header: `X-Internal-Secret: <valor de INTERNAL_TICK_SECRET>`
- Timeout: o máximo permitido (o tick pode demorar com a API acordando). Respostas esperadas: `200` (ok) ou `409` (já em andamento, ignorar).
- Observação: diferente do Docker Compose, a rota `/api/internal/*` aqui é pública na internet e protegida só pelo segredo (comparação em tempo constante). Use o segredo gerado e não o compartilhe.

**(b) Keep-alive**
- URL: `https://<api>.onrender.com/health` (ou `/health/live`), método `GET`, a cada 10 minutos.
- **Não** use `/health/ready` no keep-alive: ele consulta o banco e manteria o Neon acordado 24 h, estourando as 100 CU-horas/mês do plano grátis.

## 5. Seed da demo

Da sua máquina, apontando para o Neon (URL direta):

```bash
git clone https://github.com/jacaze/Meister.git && cd Meister/backend && npm ci
DATABASE_URL='<url direta do Neon>' npx prisma migrate deploy
DATABASE_URL='<url direta do Neon>' npx prisma db seed          # prisma/seed.ts
```

Após o merge do PR #24 (seed de demo): `DATABASE_URL=... DEMO_USER_EMAIL=... DEMO_USER_PASSWORD=... npx tsx src/scripts/seed-demo.ts --confirm`, ou `node dist/scripts/seed-demo.js --confirm` no **Shell** do Render (indisponível no plano Free; por isso rode da sua máquina). Escolha uma senha forte e não a registre no repositório.

## 6. Checklist de verificação

- [ ] Deploy da API verde; logs mostram `prisma migrate deploy` e `MEIster API rodando em http://0.0.0.0:10000`.
- [ ] `curl -fsS https://<api>.onrender.com/health/ready` retorna `"database":"up"`.
- [ ] `https://<web>.onrender.com/` abre; recarregar uma rota interna (ex.: `/dashboard`) não dá 404 (rewrite SPA).
- [ ] `curl -i https://<web>.onrender.com/api/` chega na API (rewrite) e login/cadastro funcionam pelo navegador.
- [ ] `curl -i -X POST https://<api>.onrender.com/api/internal/tick` sem header retorna `401`; com o header correto, `200`.
- [ ] Telegram: `getWebhookInfo` sem `last_error_message`; mandar uma mensagem ao bot gera lançamento.
- [ ] Logs não mostram o IP do proxy do Render para todos os usuários (ver `TRUST_PROXY` abaixo).

`scripts/smoke-prod.sh` **não se aplica** a esta hospedagem: ele sobe localmente o stack Caddy + cron do docker-compose. Para validar a imagem da API localmente antes de publicar: `docker build -t meister-api backend`.

## 7. Limitações da demo (leia antes da banca)

Fontes consultadas em 22/11/2026: render.com/docs/free, render.com/docs/redirects-rewrites, render.com/docs/blueprint-spec, render.com/docs/deploys, neon.com/docs/introduction/plans, neon.com/docs/connect/connection-pooling.

- **Cold start:** o Web Service Free hiberna após 15 min sem tráfego de entrada e leva cerca de 1 minuto para voltar. O keep-alive de 10 min evita isso, mas **não é garantido**; abra a URL 2 minutos antes da apresentação.
- **Horas:** 750 horas Free por mês e por workspace. Um serviço 24 h consome ~720-744 h: **não crie outro Web Service Free** no mesmo workspace. Esgotando, o Render suspende os serviços até o mês seguinte.
- **Memória:** 512 MB de RAM e 0,1 CPU no plano Free (informação do plano de instâncias do Render, não exibida na página `free` consultada; confirme no painel). Evite operações pesadas.
- **Neon Free:** 100 CU-horas/projeto/mês, 1 GB de armazenamento, escala a zero após 5 min (primeira consulta depois disso tem um atraso de poucos segundos).
- **Filesystem efêmero** e logs curtos; sem Shell/disco persistente no Free.
- **Sem preDeployCommand** no Free; migrations no start (seção 2).
- **Fuso:** o container roda em UTC; as regras de dia/mês/DAS usam `America/Sao_Paulo` no código (`DEFAULT_TIMEZONE`), então o tick horário funciona corretamente, mas horários nos logs aparecem em UTC.
- **Rate limit em memória** (300 req/min por IP, e bloqueio de login): zera a cada reinício/hibernação e não é compartilhado entre instâncias.
- **`TRUST_PROXY=uniquelocal`:** presume que o proxy do Render se conecta pela rede privada. Se, em teste, todos os clientes aparecerem com o mesmo IP do proxy, o rate limit e o registro de IP de consentimento ficarão agrupados; para a demo é aceitável, mas não para produção.
- **Rewrite para URL externa:** a documentação do Render permite destino de URL completa e pública; o comportamento com cabeçalhos de resposta deve ser confirmado no primeiro teste (checklist acima). Alternativa se falhar: publicar o frontend com `VITE`-baseURL absoluta e `CORS_ORIGINS` (exige alterar o código; não incluído).
- Free não é para produção segundo o próprio Render. Para uso real, use o guia `docs/deploy.md` (VPS).
