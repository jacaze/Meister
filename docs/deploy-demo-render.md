# Deploy da DEMO — Neon + Render + cron-job.org (custo zero)

Roteiro para hospedar a demonstração da banca sem custo. **Não é produção** (ver "Limitações").
O repositório já traz tudo pronto: `render.yaml` (Blueprint), `backend/Dockerfile` (com o CLI do Prisma fixado) e `scripts/check-render-blueprint.sh` (validação no CI).

Arquitetura:

```
Navegador -> Static Site (Render, meister-web)
Navegador -> https://<api>.onrender.com/api/...  (direto, com CORS) -> Neon (Postgres)
Telegram  -> https://<api>.onrender.com/telegram/webhook
cron-job.org -> POST /api/internal/tick (a cada 3 h no preparo; 1 h no dia da banca)  e  GET /health/live (só na janela da banca)
```

### API direta + CORS (mesmo modelo do Burguer House)

O Static Site **não** faz mais rewrite de `/api/*`. O frontend lê a variável de build `VITE_API_URL` (ex.: `https://meister-api.onrender.com`, **sem `/api` e sem barra final**) e chama `${VITE_API_URL}/api/...` direto do navegador. Sem `VITE_API_URL` o frontend continua usando `/api` relativo (dev com proxy do Vite e Docker Compose com Caddy, mesma origem).

Motivo: o rewrite externo do Static Site é mais um ponto de falha (cabeçalhos, timeout em cold start) e o Burguer House já funciona em produção com API direta. Como a autenticação é por header `Authorization: Bearer` (a API não usa cookie de sessão), basta o CORS: `CORS_ORIGINS` da API = URL do Static Site. O `@fastify/cors` da API responde ao preflight permitindo `Authorization` e `Content-Type` (verificado: 204 com `access-control-allow-headers: authorization,content-type`). `VITE_API_URL` é embutida no bundle: alterar exige novo build do Static Site.

## 1. Neon (banco)

1. Crie conta em neon.com e um projeto novo **separado do Burguer House** (Postgres 16 ou superior). Escolha a região **AWS US East (N. Virginia, `aws-us-east-1`)**, a mesma do Render `virginia`, para reduzir a latência API-banco. Conforme neon.com/docs/introduction/plans (consultado em 22/11/2026), o plano Free permite até 100 projetos (100 CU-horas e 1 GB por projeto, 20 GB no total), então um projeto por aplicação cabe sem custo e isola os dados.
2. Em **Connect**, **desmarque** "Connection pooling" e copie a connection string **direta** (host `ep-xxxx.region.aws.neon.tech`, **sem** `-pooler`). Garanta `?sslmode=require` no final.
3. Guarde a string; ela será o `DATABASE_URL`.

Por que a URL direta: as migrations do Prisma exigem conexão direta (a documentação do Neon recomenda conexão direta para migrations e tarefas administrativas; o pooler usa PgBouncer em modo transação). O lock do tick usa `pg_try_advisory_xact_lock` (por transação) e em tese funcionaria no pooler, mas não há ganho para uma demo com poucos acessos, então usamos a direta em tudo.

## 2. Render (API + frontend via Blueprint)

1. Faça push da branch/ revisão que contém `render.yaml` (ex.: `develop` após o merge do PR de deploy).
2. No Render: **New > Blueprint**, conecte o repositório `jacaze/Meister`, escolha a branch e confirme. Serão criados `meister-api` (Web Service Docker, plano Free) e `meister-web` (Static Site), a API na região **Virginia** (`region: virginia` no Blueprint; o Burguer House usa a mesma). O Static Site não tem região: é servido pela CDN global do Render, que recusa `region` em Static Site.
3. O Render pedirá os valores das variáveis `sync: false` (só na criação; depois edite em **Environment** de cada serviço).
4. Se os nomes `meister-api`/`meister-web` já estiverem em uso, a URL ganhará um sufixo. Use a URL real da API em `VITE_API_URL`.
5. Preencha `VITE_API_URL` do `meister-web` com a URL do `meister-api` (ex.: `https://meister-api.onrender.com`, sem `/api` e sem barra final). Depois do primeiro deploy, copie a URL do Static Site (`https://meister-web.onrender.com`) e preencha `APP_URL` e `CORS_ORIGINS` da API (se não souber antes, deixe provisório e corrija; o serviço reinicia). Se `VITE_API_URL` for alterada depois, dispare **Manual Deploy > Clear build cache & deploy** no `meister-web`.

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

### Variáveis do frontend (`meister-web`)

`VITE_API_URL` (obrigatória no Render; `sync: false`): URL da API, sem `/api` e sem barra final.

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

## 4. cron-job.org e orçamento de horas

**Atenção:** as 750 horas/mês do plano Free são **por workspace** e compartilhadas com o Burguer House já hospedado. Um serviço acordado 24 h gasta ~720-744 h sozinho, então **não use keep-alive 24 h**. A API hiberna após 15 min sem tráfego, e cada chamada acorda a API por cerca de 15 min. **Antes de agendar, confira o uso atual em Render > Billing** (horas já consumidas no mês pelo Burguer House) e ajuste a tabela.

| Cenário | Chamadas/dia | Horas acordada/dia | Horas/mês (30 dias) |
|---|---|---|---|
| Tick a cada hora (24 x 15 min) | 24 | ~6 h | ~180 h |
| **Preparação: tick a cada 3 h (8 x 15 min)** | 8 | ~2 h | **~60 h** |
| Dia da banca: ping a cada 10 min em janela de ~4 h (2 h antes + ~2 h de apresentação) + tick horário na janela | contínuo | ~4-5 h | +4-5 h (uma vez) |
| Keep-alive 24 h (**removido**) | contínuo | 24 h | ~720-744 h |

Plano: ~60 h/mês na preparação + ~5 h no dia da banca = ~65 h/mês para o MEIster, somados às horas do Burguer House (verifique que a soma fica abaixo de 750 h). Se o Burguer House já consome muito, aumente o intervalo do tick (6 h = ~30 h/mês).

Crie conta gratuita em cron-job.org e os jobs:

**(a) Tick** (fase de preparação: a cada 3 horas; no dia da banca: a cada hora)
- URL: `https://<api>.onrender.com/api/internal/tick`
- Método: `POST`; agendamento: minuto 0 a cada 3 horas (`*/3`); no dia da banca altere para a cada hora.
- Header: `X-Internal-Secret: <valor de INTERNAL_TICK_SECRET>`
- Timeout: o máximo permitido (o tick pode demorar com a API acordando). Respostas esperadas: `200` (ok) ou `409` (já em andamento, ignorar).
- Observação: diferente do Docker Compose, a rota `/api/internal/*` aqui é pública na internet e protegida só pelo segredo (comparação em tempo constante). Use o segredo gerado e não o compartilhe.

**(b) Ping de presença (SOMENTE no dia da banca)**
- URL: `https://<api>.onrender.com/health/live`, método `GET`, a cada 10 minutos, **ativo só na janela** (de 2 h antes até o fim da apresentação). **Desative o job logo depois.** Deixe-o criado e desabilitado nos outros dias.
- **Não** use `/health/ready`: ele consulta o banco e manteria o Neon acordado, gastando as 100 CU-horas/mês do plano grátis.
- Abra o site 2 minutos antes de começar para confirmar que a API está acordada.

## 5. Seed da demo

Da sua máquina, apontando para o Neon (URL direta). O script real é `backend/src/scripts/seed-demo.ts`:

```bash
git clone https://github.com/jacaze/Meister.git && cd Meister/backend && npm ci
DATABASE_URL='<url direta do Neon>' npx prisma migrate deploy
DATABASE_URL='<url direta do Neon>' \
DEMO_USER_EMAIL='<email da demo>' DEMO_USER_PASSWORD='<senha forte>' \
npx tsx src/scripts/seed-demo.ts --confirm
```

O `migrate deploy` vem antes (cria o schema; a API também o executa no start, mas o seed precisa do schema pronto). Escolha uma senha forte e não a registre no repositório. O Shell do Render não existe no plano Free; por isso rode da sua máquina.

## 6. Checklist de verificação

- [ ] Deploy da API verde; logs mostram `prisma migrate deploy` e `MEIster API rodando em http://0.0.0.0:10000`.
- [ ] `curl -fsS https://<api>.onrender.com/health/ready` retorna `"database":"up"`.
- [ ] `https://<web>.onrender.com/` abre; recarregar uma rota interna (ex.: `/dashboard`) não dá 404 (fallback SPA).
- [ ] Abra o site, faça login e, no DevTools (aba Network), confirme chamadas para `https://meister-api.onrender.com/api/...` com status 200 e **sem erro de CORS** no Console. Se aparecer erro de CORS, confira `CORS_ORIGINS` (URL exata do Static Site, sem barra final) e se `VITE_API_URL` foi preenchida antes do build.
- [ ] Em **Render > Billing**, o uso de horas do workspace está compatível com a tabela da seção 4.
- [ ] `curl -i -X POST https://<api>.onrender.com/api/internal/tick` sem header retorna `401`; com o header correto, `200`.
- [ ] Telegram: `getWebhookInfo` sem `last_error_message`; mandar uma mensagem ao bot gera lançamento.
- [ ] Logs não mostram o IP do proxy do Render para todos os usuários (ver `TRUST_PROXY` abaixo).

`scripts/smoke-prod.sh` **não se aplica** a esta hospedagem: ele sobe localmente o stack Caddy + cron do docker-compose. Para validar a imagem da API localmente antes de publicar: `docker build -t meister-api backend`.

## 7. Limitações da demo (leia antes da banca)

Fontes consultadas em 22/11/2026: render.com/docs/free, render.com/docs/redirects-rewrites, render.com/docs/blueprint-spec, render.com/docs/deploys, neon.com/docs/introduction/plans, neon.com/docs/connect/connection-pooling.

- **Cold start:** o Web Service Free hiberna após 15 min sem tráfego de entrada e leva cerca de 1 minuto para voltar. No dia da banca use o ping de presença (seção 4), que **não é garantido**; abra a URL 2 minutos antes da apresentação.
- **Horas:** 750 horas Free por mês e por workspace, compartilhadas com o Burguer House (seção 4). Esgotando, o Render suspende os serviços até o mês seguinte.
- **Memória:** 512 MB de RAM e 0,1 CPU no plano Free (informação do plano de instâncias do Render, não exibida na página `free` consultada; confirme no painel). Evite operações pesadas.
- **Neon Free:** 100 CU-horas/projeto/mês, 1 GB de armazenamento, escala a zero após 5 min (primeira consulta depois disso tem um atraso de poucos segundos).
- **Filesystem efêmero** e logs curtos; sem Shell/disco persistente no Free.
- **Sem preDeployCommand** no Free; migrations no start (seção 2).
- **Fuso:** o container roda em UTC; as regras de dia/mês/DAS usam `America/Sao_Paulo` no código (`DEFAULT_TIMEZONE`), então o tick horário funciona corretamente, mas horários nos logs aparecem em UTC.
- **Rate limit em memória** (300 req/min por IP, e bloqueio de login): zera a cada reinício/hibernação e não é compartilhado entre instâncias.
- **`TRUST_PROXY=uniquelocal`:** presume que o proxy do Render se conecta pela rede privada. Se, em teste, todos os clientes aparecerem com o mesmo IP do proxy, o rate limit e o registro de IP de consentimento ficarão agrupados; para a demo é aceitável, mas não para produção.
- Free não é para produção segundo o próprio Render. Para uso real, use o guia `docs/deploy.md` (VPS).
