# 08 — Rotina interna agendada (tick): DAS e sincronização bancária

**Prioridade:** 🟡
**Donos:** QA (teste) → Backend (endpoint e casos de uso) → DevOps (agendador)
**Branch sugerida:** `feat/rotina-interna-tick`

## Problema

Nada roda sozinho no backend:

- `INTERNAL_TICK_SECRET` é validado no `backend/src/shared/env.ts:66,87`, mas **nenhuma rota usa**.
- Cobranças do DAS (`modules/fiscal/application/use-cases/EnsureDasCharges.ts`) só são geradas
  quando alguém abre a tela. O status `atrasado` não é atualizado sozinho.
- Contas bancárias só sincronizam quando o usuário clica em "sincronizar"
  (`SyncPluggyConnection.ts`). Não existe sincronização periódica.

## O que fazer

### Backend

1. Rota `POST /api/internal/tick`, **fora** do `authMiddleware` de usuário, protegida por cabeçalho
   `X-Internal-Secret` comparado em tempo constante (`crypto.timingSafeEqual`) com `INTERNAL_TICK_SECRET`.
   - Sem segredo configurado → a rota responde 404 (desligada).
   - Segredo errado → 401, sem diferença de tempo detectável.
   - Arquivo próprio `internalRoutes.ts` + **uma** linha em `app.ts`.
2. O tick executa, para cada workspace:
   - `EnsureDasCharges` do mês corrente (idempotente) e marcação de vencidas como `atrasado`
     usando `Clock`/`America/Sao_Paulo`.
   - Sincronização das conexões Pluggy com `lastSyncAt` mais antigo que N horas (padrão 12h,
     variável `OPENFINANCE_SYNC_INTERVAL_HOURS`). Reaproveite `syncPluggyConnection` montando um
     `WorkspaceScope` de sistema. Se precisar de um scope de sistema que não existe, crie-o em
     `shared` com nome explícito (ex.: `systemScopeFor(workspaceId)`) e só permita uso pela rotina interna.
   - Falha em um workspace não interrompe os outros; registre contagem de sucesso/erro no log
     (sem dados financeiros).
3. Proteção contra execução dupla: lock simples (advisory lock do Postgres, `pg_try_advisory_lock`)
   para dois ticks simultâneos não sincronizarem a mesma conexão.
4. Responder `{ das: {...contagens}, openfinance: {...contagens} }`.
5. Variáveis novas em `.env.example` e `env.ts`. Atualizar OpenAPI.

### DevOps

6. Agendar o tick: serviço `cron` no compose de produção (imagem leve chamando
   `curl -fsS -X POST -H "X-Internal-Secret: $INTERNAL_TICK_SECRET" http://api:3000/api/internal/tick`
   a cada hora) ou o agendador da plataforma escolhida na tarefa 03.

## Teste que deve falhar antes

Integração (`backend/tests/internal-tick.integration.test.ts`):

- Sem cabeçalho → 401; cabeçalho errado → 401; `INTERNAL_TICK_SECRET` vazio → 404.
- Com segredo certo: workspace MEI sem DAS do mês → DAS criado; rodar de novo → nenhum DAS duplicado.
- DAS pendente com vencimento ontem (Clock fixo) → vira `atrasado`.
- Conexão Pluggy com `lastSyncAt` de 13h atrás → `syncItem` chamado no aggregator falso; de 1h atrás → não chamado.
- Aggregator falso lança erro no workspace A → workspace B ainda sincroniza.

## Critério de pronto

- [ ] Testes falharam antes (rota inexistente) e passam depois.
- [ ] Agendador configurado e documentado.
- [ ] Gate 0 verde; tabela do `README.md` desta pasta atualizada.
