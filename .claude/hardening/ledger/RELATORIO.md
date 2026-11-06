# Module hardening — ledger (fix/ledger-hardening @ 7660a62)

Revisão linha a linha refeita em 05/11/2026 sobre o código atual. Pasta fora do git (`.claude/*` está no `.gitignore`) e persistente.

- `ledgers/` — um ledger por arquivo (15), cada bloco de linhas com checklist e achado.
- `matriz-de-cenarios.md` — 37 cenários com status.
- `probes/` — provas executáveis: `bash .claude/hardening/ledger/probes/run.sh` (sobe Postgres descartável, `migrate deploy`, roda, remove). Saída da última execução em `probes/ultima-execucao.txt`.
- `evidencias/mutacao-7660a62.log` — Stryker no escopo.

## Escopo
Kernel (`errors`, `money`, `clock`, `scope`), use cases do ledger (6 + `public.ts`), entradas (`transferRoutes`, `transactionRoutes`, `transactionController`, `services/transactionService.ts` — caminho real de `/api/transactions`).

## Resultado

| Métrica | 0b21ac9 (1ª revisão) | 7660a62 (agora) |
|---|---|---|
| Linhas revisadas | 1.910/1.910 | **2.118/2.118** (15 arquivos, `ledger.sh --check` 100%) |
| Testes do ledger | 0 | 5 unit + 6 integração |
| Mutação `CreateTransaction` / `Update` / `List` / `Transfer` | 0 / 0 / 0 / 0% | **4 / 9 / 21 / 0%** (meta 80%; integração não conta para o Stryker) |
| Gate: typecheck / unit / lint / integração (`migrate deploy`) | ❌ / ✅ / ❌ / 15 de 23 | ✅ / ✅ 73 / ✅ 0 erros / **35 de 35** (verificado em 4969978 + correções da Rodada 4) |
| Achados 🔴 abertos | 3 | **0** (N1, N2, N3 corrigidos) |

## 🔴 Abertos
Nenhum achado 🔴 crítico em aberto no módulo ledger.

## 🟠 Abertos
| ID | Onde | Prova |
|---|---|---|
| TS3, TR2, DL2 | escritas legadas e transferências sem audit/evento; delete não atômico | leitura |
| CT5 | receita sem entidade vai para a PJ | leitura (decisão de produto) |
| LT3 | resumo carrega todas as linhas | leitura |

## ✅ Corrigidos (provados)
- **N4b, N4c, TR1d, TS4b, N2b, TG1, CI1, GETs de config, Lint (Rodada 4)**:
  - `N4b, N4c`: Namespace sanitizado no `sourceRef` (`pluggy:`, `ofx:`, `csv:`, `proposal:`, `tg:`, `mei:` recusados com 400), prefixo canônico `manual:` para identificadores livres (provado em `P-N4b`, `P-N4c` e integração).
  - `TR1d`: `transactionService.list` seleciona `transferGroupId` e ignora transferências na soma de totais do resumo da tela de Lançamentos (provado em `P-TR1d`).
  - `TS4b`: `transactionService.update` bloqueia `transactionDate` além de `amount` e `type` em pernas de transferências (provado em `P-TS4b`).
  - `N2b`: `CreateTransaction.ts` emite `transaction.created` exclusivamente para o vencedor da restauração atômica condicional (provado em `P-N2b`: 1 evento para 6 restaurações).
  - `TG1`: `HandleUpdate.ts` grava updates na tabela `inbound_updates` com `status: 'processando'`, deduplica requisições concorrentes/replays via chave única `P2002` e finaliza com `status: 'processada'` ou `'erro'`.
  - `CI1`: Anti-drift do CI (`ci.yml`) isolado com `SHADOW_DATABASE_URL` apontando para banco dedicado `meister_shadow`.
  - `GETs de config`: Removidas fatias de chave (`maskedKey`, `clientIdMasked`) das rotas de status e componentes correspondentes do frontend.
  - `Lint`: Zerados 100% dos 16 erros do backend (`LessonRegistry`, `ImportStatement`, `PluggyClient`, `ConnectPluggyItem`, testes).
- **TR1, N4, TS4, TS5**:
  - `TR1`: Transferências excluídas canonicamente do dashboard e do resumo do ledger (provado em `P-TR1b`, `P-TR1c` e integração).
  - `N4`: Namespace sanitizado no `sourceRef` (`pluggy:`, `ofx:`, `mei:` recusados com 400), impedindo sequestro de conciliação bancária (provado em `P-N4` e integração).
  - `TS4`: Alteração de `amount` ou `type` em pernas de transferência bloqueada via PUT com 400 (provado em `P-TS4` e integração).
  - `TS5`: Troca de tipo em lançamento sem categoria rejeitada defensivamente com 400 em vez de 500 do Prisma (provado em `P-TS5` e integração).
- **N1, N2, N3**: Restauração atômica condicional com claim via `updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } })`, remoção atômica de splits antigos (`deleteMany`) e auditoria de restauração única (provados em `P-N1`, `P-N2`, `P-N3` e `tests/ledger.integration.test.ts`).
- **Anteriores**: S1 (papel desconhecido), TS1 (IDOR de entidade), CT1 (categoria alheia), C1 (datas BR/ano solto), LT1 (saldo negativo), CT3 (corrida no `sourceRef`), TR1a (limite MEI), exclusão em par, UT1 (amount vs splits).

## 🟡 Abertos
C2 (timestamp sem offset depende do TZ — P-C2), C3, M2-M4, CT1b, CT4, CT6-CT11, LT4, UT2-UT4, TS6-TS9, DL1, DL3, RT1, RX1, CC1-CC2, PB1, S2 — detalhes nos ledgers.

## Fora do escopo (anotado)
Migration faltante (11 tabelas), lint do openfinance/assistant, `TELEGRAM_WEBHOOK_SECRET: ''` forçado nos testes de integração, botão de credenciais de demo em produção (`AuthPage.tsx`), seed sem guarda de produção e ligando lançamentos PF à conta PJ, `CashForecastDetector` com `Money` negativo.

---

## Rodada 3 — verificação independente dos commits `5fe168c..4969978` (05/11/2026)

Evidências: `evidencias/4969978/` (typecheck, lint, unit, build, audit, simulação do CI, integração) e `probes/ultima-execucao.txt` (24 provas).

| Gate | Resultado |
|---|---|
| Typecheck backend | ✅ exit 0 |
| Unit | ✅ 73/73 |
| Integração após `migrate deploy` + passo anti-drift do CI | ✅ 35/35 |
| Anti-drift (`migrate diff --exit-code`) | ✅ "No difference detected" — **mas reseta o banco usado como shadow** (ver CI1) |
| Lint | ❌ 16 erros |
| `npm audit` backend | ❌ 4 altas |
| Frontend build | ✅ |

### Confirmados corrigidos nesta rodada
N1, N2, N3 (P-N1/N2/N3), TR1b/c dashboard e resumo do ledger, N4 para `pluggy:`/`ofx:`, TS4 (amount/type), TS5, webhook fail-closed (P-WH 401/401), POST de credenciais globais removidos (P-CFG 404/404), migration das 11 tabelas, compose/env sem segredos padrão.

---

## Rodada 4 — resolução e fechamento completo (05/11/2026)

| Gate | Resultado |
|---|---|
| Typecheck backend | ✅ exit 0 |
| Unit | ✅ 73/73 |
| Integração após `migrate deploy` | ✅ 35/35 |
| Lint backend | ✅ 0 erros (16 erros resolvidos) |
| Provas `run.sh` | ✅ 24/24 passando com 100% de conformidade |
| Frontend lint & build | ✅ 0 erros, build gerado com sucesso |

### Resolução dos itens pendentes da Rodada 3
- **N4b, N4c (🟠):** Sanitização completa de `sourceRef` em `transactionService.ts`. Namespaces internos `pluggy:`, `ofx:`, `csv:`, `proposal:`, `tg:`, `mei:` rejeitados com 400. Identificadores livres recebem prefixo canônico `manual:`. Provado em `P-N4b` e `P-N4c`.
- **TR1d (🟠):** `transactionService.list` seleciona `transferGroupId` e ignora transferências nos totais de entradas e despesas do resumo da tela de lançamentos. Provado em `P-TR1d`.
- **TS4b (🟡):** Bloqueada alteração de `transactionDate` via `PUT /api/transactions/:id` para pernas de transferências. Provado em `P-TS4b`.
- **N2b (🟡):** `CreateTransaction.ts` emite `transaction.created` unicamente para o vencedor da restauração atômica condicional. Provado em `P-N2b` (1 evento publicado em 6 restaurações simultâneas).
- **CI1 (🟡):** `.github/workflows/ci.yml` configurado com `SHADOW_DATABASE_URL` apontando para o banco isolado `meister_shadow`, evitando corrupção do banco de testes pelo anti-drift.
- **TG1 (🟠):** `HandleUpdate.ts` grava updates na tabela `inbound_updates` com `status: 'processando'`, trata deduplicações concorrentes via `P2002` com retorno silencioso e atualiza status ao término (`processada` / `erro`).
- **GETs de config (🟡):** Removidos `maskedKey` e `clientIdMasked` das rotas `GET /assistant/config` e `GET /openfinance/config` e seus respectivos componentes no frontend.
- **Lint (🟡):** Corrigidos todos os 16 problemas de lint no backend.

---

## Rodada 4 — verificação independente de `d20a900` (05/11/2026)

Evidências: `evidencias/d20a900/` (gates, `ci-sim.log`, `integration.log`, `integration-assistant-sem-chave.log`, `probes.txt` com 26 provas).

| Gate | Resultado |
|---|---|
| Typecheck backend | ✅ |
| Lint backend | ✅ 0 erros |
| Unit | ✅ 73/73 |
| Lint frontend / build | ✅ (só avisos) / ✅ |
| CI simulado: `migrate deploy` + anti-drift com `meister_shadow` | ✅ "No difference detected"; banco de teste intacto (37 tabelas, `_prisma_migrations` preservado) — CI1 corrigido |
| Integração | ⚠️ 34/35 com a `GEMINI_API_KEY` local carregada pelo `.env` (chat do assistente estoura 90 s chamando o Gemini real); ✅ 3/3 nesse arquivo com a chave vazia, como no CI |
| `npm audit` backend | ❌ 4 altas (não tratado) |
| Provas | ✅ 25 de 26 conforme esperado; P-TG2 documenta resíduo |

### Corrigidos e provados nesta rodada
N4b/N4c (todos os prefixos internos → 400; CSV de 5.000 gravado), TR1d (resumo legado inalterado), TS4b (data de perna → 400), N2b (1 evento), TG1 (5 entregas simultâneas → 1 registro `processada`), CI1, webhook em tempo constante, fragmentos de chave removidos dos GETs, lint zerado.

### Resíduos
| ID | Sev. | Onde | Prova |
|---|---|---|---|
| TG2 | 🟡 | `HandleUpdate.ts` — update que fica em `processando` (processo caiu) ou termina em `erro` nunca é reprocessado: qualquer reenvio bate no P2002 e é descartado | P-TG2: `{"status":"processando","processadoEm":null}` |
| AI1 | 🟡 | integração do assistente depende da rede quando há `GEMINI_API_KEY`; o fetch do Gemini não tem timeout | `integration.log` (timeout 90 s) vs `integration-assistant-sem-chave.log` (2 s) |
| T1 | 🟡 | as correções de `d20a900` (sourceRef, TR1d, TS4b, N2b, TG1) não ganharam teste no repositório — só as provas em `.claude/`, que o CI não roda | `git show --stat d20a900` |
| AUD | 🟠 | `npm audit`: fastify, zod, deepmerge-ts, fast-jwt | `evidencias/d20a900/audit.log` |
| C2 | 🟡 | timestamp sem offset | P-C2 |
