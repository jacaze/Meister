# Contexto para retomar o trabalho

**Atualizado em:** 2026-11-22. `develop` em `6c5dcac`. Nenhum PR aberto.
**Objetivo atual:** hospedar o MEIster e **apresentar o produto funcionando para a banca** (não é lançamento público).
O escopo da demo está em `guia-planejamento-ia/08-escopo-demonstracao-banca.md` (pasta local, fora do git).

## 1. Como o trabalho está organizado

- Repositório: `jacaze/Meister`. Fluxo: branch `feat/*`, `fix/*` ou `docs/*` saindo de `develop` → PR contra `develop` →
  merge só quando o dono disser ("pode mergear"). `main` é a versão de produção e está **248 commits atrás** do `develop`.
- **Um worktree por tarefa** em `/home/feltan/Projetos/Meister-wt-<nome>`, a partir de `origin/develop`. A pasta
  `/home/feltan/Projetos/Meister-main` tem alterações locais do dono (`.gitignore`, `frontend/vite.config.ts`) numa branch
  antiga: **não mexer nela**.
- Tarefas: `docs/tarefas/README.md` (tabela de status) e um `.md` por tarefa. Cada PR marca a sua tarefa como FEITA.
- Regras do `CLAUDE.md`: teste que falha antes (cole a saída no PR), Gate 0 verde, dinheiro em `Money`, `WorkspaceScope`
  em toda consulta, recurso de outro workspace = 404.
- **Dois agentes trabalham em paralelo**: esta sessão (Claude Code) e um agente no Antigravity, que recebe tarefas por
  texto colado pelo dono. O dono cola aqui os relatórios do outro agente: revisar cada um com evidência (diff, CI, testes,
  reproduzir suspeitas) antes de aprovar.

### Cuidados práticos

- **Banco de testes compartilhado** `meister_test` (container `meister-db`, porta 5436). Antes de `npm run test:integration`,
  conferir `pgrep -f "vitest run -c vitest.integration"` e o `cwd` de cada processo; esperar se for de outro worktree.
- Worktree que muda o schema precisa de **`node_modules` próprio** (`npm ci`). Com `node_modules` em link para o da
  `Meister-main`, o `prisma generate` troca o cliente usado pelo app rodando e o quebra.
- Migration nova: gerar o SQL com `prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url`
  (criar e apagar um banco sombra no `meister-db`), aplicar no `meister_test` e conferir `--exit-code` = 0, como o CI faz.
- `prisma migrate reset` exige consentimento explícito do dono (variável `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`).
- O Docker não enxerga o diretório temporário da sessão: worktrees de verificação com bind mount ficam em `~/Projetos`.

### App rodando localmente (para o dono testar)

- Cópia em `/home/feltan/Projetos/Meister-run` (HEAD destacado no `develop`). Ao mesclar algo: `git checkout --detach
  origin/develop`, `prisma migrate deploy` no banco de dev (`meister`, porta 5436) e `prisma generate`.
- Servidores pelo painel de preview do Claude, com entradas `meister-run-api` (porta 3000) e `meister-run-web`
  (porta 5173, `--host 0.0.0.0`) no `.claude/launch.json` **do Burguer_House** (é de lá que o painel lê).
- Celular na mesma rede: `http://192.168.1.123:5173`. Pluggy/MeuPluggy precisa do navegador normal: o painel do Claude
  bloqueia o pop-up de autorização.
- Banco de dev zerado em 2026-11-21 com consentimento; só tem os parâmetros fiscais. O dono cria a conta de novo.

## 2. O que foi feito (PRs #5 a #21, todos mesclados)

| PR | Tarefa | O quê |
|---|---|---|
| #5, #13, #18 | docs | Levantamento de tarefas; PF/PJ, perfil, acertos e família; desenho da família (`docs/familia.md`) |
| #6 | 01 | Dono do item da Pluggy: ninguém importa extrato de outro usuário |
| #7, #12 | 05 | Configuração da Pluggy validada; `clientUserId` em `options` (fez a conta real funcionar via MeuPluggy) |
| #8 | 02 | Compose repassa todas as variáveis; `check-compose-env.sh` no CI |
| #9 | 13 | `TRUST_PROXY` (lista de IPs/CIDR; número de saltos não funciona no Fastify 5.12.8) |
| #10 | 03 | Deploy com Caddy, HTTPS, cabeçalhos PWA, `smoke-prod.sh` |
| #11 | 06 | Importação da Pluggy tudo-ou-nada, sem corte em 5 mil transações |
| #14 | 14 | "De quem são estas contas?" após conectar; aprovação usa a entidade da conta |
| #15 | 17 | Perfil no primeiro acesso (sozinho, negócio, família, família com negócio); autônomo como entidade |
| #16 | 18 | De quem é o gasto × quem pagou; acertos entre entidades; tela Acertos |
| #17 | 08 | Tick interno de hora em hora (DAS de todos os MEIs, sincronização), cron no compose de produção |
| #19, #20 | 15 | Família fases 1 (schema) e 2 (escopo por pessoa); `x-workspace-id` alheio não cria mais workspace |
| #21 | 09 | Webhook da Pluggy com assinatura HMAC, sem loop, sem corrida com o tick |

Status das tarefas: feitas 01, 02, 03, 05, 06, 08, 09, 13, 14, 17, 18 (v1). Em andamento: 15 (família, fases 1 e 2 de 8).
Pendentes: 04 (release), 07 (valores da Pluggy com `Money`), 10 (`DEMO_MODE`), 11 (README). Bloqueadas: 12 (SERPRO), 16.

## 3. Próximo passo: preparar a demo hospedada

Parecer completo dado ao dono em 2026-11-22. Resumo:

**Hospedagem:** 1 VPS pequena (2 vCPU / 4 GB) + domínio, com `docker-compose.yml` + `docker-compose.prod.yml`.
A opção serverless do planejamento (Vercel + Neon) **não serve mais**: tick/cron, lock no Postgres, fila do webhook e
rate limit em memória precisam de processo contínuo.

**Trava a demo (conferido no código):**
1. Seed de demonstração: `prisma/seed.ts` cria só 3 lançamentos (o planejamento pede 12 meses, CNPJ aberto no ano e
   cenário a ~75% do limite) e roda com `tsx`, que o Dockerfile remove (`npm prune --omit=dev`): não roda no servidor.
2. Sandbox da Pluggy escondido no build de produção (`includeSandbox={import.meta.env.DEV}` em
   `PluggyConnectFallbackModal.tsx`). O planejamento proíbe conectar conta real no servidor hospedado.
3. Telegram não recebe mensagens: há a rota `POST /telegram/webhook`, mas nada faz `setWebhook` (com `secret_token`) nem polling.
4. Release `develop` → `main` (tarefa 04).

**Para a apresentação sair segura:** ensaio ponta a ponta dos itens Must (Telegram texto e foto da NFC-e, alerta de 80%,
potes, DAS — não testados nesta rodada); Gate B no fluxo Telegram → IA → lançamento → alerta → pote; contingência
(`DEMO_MODE=replay` não existe: implementar ou usar stack local + vídeo); botão "Executar rotinas agora"; esconder ou
explicar as opções de família no onboarding.

**Divisão sugerida:** Claude Code = seed que roda no servidor, variável do sandbox, botão de rotinas. Agente do Antigravity
= registro do webhook do Telegram e script de deploy por SSH, depois ensaio técnico. Dono = VPS, domínio, chaves
(Gemini com limite de gasto, bot de demo, trial da Pluggy ativo na data da banca), release e decisão replay × vídeo.

**Perguntas abertas ao dono:** data da banca; se já tem VPS e domínio.

## 4. Pendências e achados registrados

- Família (`docs/familia.md`): fases 3 a 8. Pré-requisito antes da fase 4: `BankConnection` registrar quem conectou
  (schema). Decisão pendente do dono: incluir isso no começo da fase 3 ou em PR separado. Na fase 8, Telegram deve usar
  o `workspaceId` do vínculo.
- Tarefa 18 v2: saldo de caixa por entidade; "Transferi" não cria transferência; insight de mistura PF/PJ ainda lê
  `viaPersonalAccount`; lançamentos antigos não viraram acertos.
- `DELETE /api/openfinance/connections/:id` não revoga o item na Pluggy (LGPD).
- `insights/application/use-cases/AskFinances.ts:69` procura DAS `'vencido'` (não existe; o certo é `'atrasado'`).
- Tick: conexões em `erro` sempre ficam à frente das saudáveis; com muitas quebradas, pode faltar orçamento (backoff futuro).
- Para produção real (depois da banca): backup, recuperar senha (não há e-mail transacional), termos/consentimento LGPD
  na tela (a API existe, o frontend não registra), Pluggy comercial, monitoramento.
- Worktrees do outro agente já mesclados e removíveis: `Meister-wt-02`, `-03`, `-08`, `-09`.
