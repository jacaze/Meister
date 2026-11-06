# Plano pós-merge (fase 3) — qualidade, revisão com evidência e dívidas

Base: `develop` em `bafdfdc` (merge do PR #1, `feat/frontend-glass`). CI "Gate 0" verde.

Este plano é executado **uma etapa por vez**. Cada etapa só começa depois que a anterior foi
entregue, revisada e aprovada pelo usuário. Não adiante trabalho de etapas futuras, nem
"aproveite" para mexer em outra coisa: o que estiver fora da etapa vira anotação no relatório.

---

## Regras que valem para todas as etapas

### Fluxo de cada etapa

1. `git switch develop && git pull` — sempre comece da `develop` atualizada.
2. Crie a branch indicada na etapa.
3. Rode a **linha de base** (abaixo) e anote os números antes de mudar qualquer coisa.
4. Execute a etapa seguindo as skills indicadas.
5. Rode a **validação obrigatória** (abaixo) e os critérios de pronto da etapa.
6. Abra o PR para `develop` com o relatório da etapa no corpo.
7. **PARE.** Entregue o relatório ao usuário e espere a aprovação. Não comece a próxima etapa.

### Skills de qualidade (obrigatórias quando a etapa pedir)

- **`module-hardening`** — para cada módulo/arquivo tocado:
  - revisão **um arquivo por vez, linha a linha**, com ledger
    (`~/.claude/skills/module-hardening/scripts/ledger.sh`), cobertura de leitura 100%
    conferida com `ledger.sh --check`;
  - ordem de dentro para fora: domínio → use cases → adaptadores → rotas;
  - matriz de cenários com as técnicas de `references/scenario-techniques.md`;
  - **todo bug corrigido ganha um teste que falha antes e passa depois** (mostre as duas saídas);
  - **teste de mutação** com Stryker no escopo da etapa
    (`npm --prefix backend run mutation -- --mutate "<arquivos>"`), resumo com
    `scripts/mutation-summary.sh`. Meta: **≥ 85%** de mutation score no código tocado
    (o `stryker.config.json` usa high 85 / low 80). Mutante sobrevivente é achado: ou falta
    teste, ou é lógica morta — explique cada um que ficar;
  - correção e melhoria em **commits separados**.
- **`adversarial-architecture-qa`** — quando houver concorrência, webhook, idempotência,
  integração externa ou autorização:
  - **reproduza a falha rodando o sistema antes de corrigir** (script em `probes/`), corrija,
    rode de novo e deixe teste de regressão;
  - teste com infraestrutura real (PostgreSQL), não com fake, o que fake não reproduz
    (corrida, transação, unicidade).
- Artefatos de cada revisão ficam em `.claude/hardening/<modulo>/` no mesmo formato do que já
  existe em `.claude/hardening/ledger/`: `ledgers/`, `matriz-de-cenarios.md`, `probes/`,
  `evidencias/`, `RELATORIO.md`.

### Linha de base e validação obrigatória (antes e depois de cada etapa)

```bash
npm --prefix backend run typecheck
npm --prefix backend run lint
npm --prefix backend run test
npm --prefix backend run test:integration
npm --prefix frontend run lint          # 0 erros; nº de avisos não pode subir (hoje: 33)
npm --prefix frontend run build
npm --prefix frontend test              # hoje: 13 testes
(cd frontend && ../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json)   # até a Etapa 1 criar o script
```

Guarda-corpos de design e código (devem continuar zerados):
`border-dashed`, `material-symbols`, `dangerouslySetInnerHTML`, `alert(`/`confirm(` nativos,
emoji, classes com `-[#`, Phosphor importado fora de `components/ui/icons.ts`, `as any` novo,
`toISOString().slice(0, 10)` para "hoje" (use `lib/date.ts`), conversão de dinheiro fora de
`lib/money.ts` (`parseBRL` para digitação, `parseDecimal` para valores da API).

Decisões de design que não podem ser revertidas: tokens de cor (terracota `--color-danger`
só para erro/excesso/excluir, avisos em mel), vidro `.glass-*`, `CheckRow`, `RichText`,
`BeeIcon`, `Toast`/`ConfirmDialog`.

### Commits e PR

- Um commit por correção/assunto, mensagens em português **com acento**, no estilo da develop.
- Sem push direto na `develop`; sem merge. O PR é aberto para `develop` e o usuário faz o merge.
- Mudança de contrato de API ou migration: destaque no PR (tabela de contrato + passo de deploy).

### Relatório de entrega de cada etapa (corpo do PR e mensagem ao usuário)

1. O que foi feito, por commit.
2. Evidências: saídas antes/depois de cada bug (teste falhando → passando), probes, prints.
3. Mutation score do escopo e mutantes sobreviventes explicados.
4. Validação obrigatória com os números (antes → depois).
5. O que ficou fora do escopo / riscos / perguntas ao usuário.

---

## Etapa 0 — Preparação (sem branch, sem código)

- [ ] Ler `CLAUDE.md`, `AGENTS.md`, este plano e as duas skills de qualidade inteiras.
- [ ] Rodar a linha de base e registrar os números no relatório da Etapa 1.
- [ ] Confirmar que o banco local `localhost:5436` está com `prisma migrate status` em dia.
      Se o seu banco tiver as migrations antigas de `transfer_type`, siga o passo descrito na
      mensagem do commit `05bb58e`.

---

## Etapa 1 — CI do frontend checa tipos e roda os testes

**Branch:** `ci/frontend-typecheck-e-testes`
**Por quê:** o job "Frontend (Lint & Build)" do `.github/workflows/ci.yml` não roda `tsc` nem
`npm test`. O Vite não checa tipos: erro de TypeScript e teste quebrado de `money.ts`,
`date.ts` ou `statementEncoding.ts` passam pelo CI.

Tarefas:
1. Adicionar `typescript` como devDependency do frontend (mesma versão major usada no backend)
   e o script `"typecheck": "tsc --noEmit -p tsconfig.json"` no `frontend/package.json`.
   Hoje o tsc do frontend só roda emprestando `../backend/node_modules/.bin/tsc`.
2. No `ci.yml`, job `frontend`: passos **Typecheck** e **Unit tests** (`npm test`) antes do
   build. Node 22 no CI: confirme que `node --test tests/*.test.ts` funciona em Node 22
   (type stripping). Se não funcionar, use `--experimental-strip-types` ou alinhe a versão do
   Node do CI com a local (24) — decida e justifique no relatório.
3. Opcional, se couber: cache do `node_modules` e `concurrency` para cancelar runs antigos.

Critérios de pronto (com evidência):
- [ ] Prova de que o gate pega erro: em commits temporários **locais** (não enviados), mostre
      `npm run typecheck` falhando com um erro de tipo proposital e `npm test` falhando com uma
      asserção quebrada; depois reverta.
- [ ] CI do PR verde com os novos passos aparecendo no log.
- [ ] Nenhuma outra mudança no frontend.

Skills: não é revisão de módulo; aplique só o princípio "um gate que nunca falhou não prova
nada" (prove que falha).

---

## Etapa 2 — Banco de testes isolado no ambiente local

**Branch:** `test/banco-de-integracao-isolado`
**Por quê:** localmente `npm run test:integration` usa o banco de desenvolvimento
(`localhost:5436/meister`) e apaga usuários, inclusive a conta demo do seed. No CI já existe
`meister_test`.

Tarefas:
1. `backend/.env.test.example` versionado (e `.env.test` no `.gitignore`) apontando para
   `meister_test` no mesmo Postgres local.
2. Script `npm run db:test:prepare`: cria o banco de teste se não existir e roda
   `prisma migrate deploy` nele.
3. `test:integration` passa a carregar `.env.test` (por exemplo via `vitest.integration.config.ts`
   lendo o arquivo, ou `dotenv -e .env.test`), sem afetar o CI, que já define `DATABASE_URL`.
4. **Guarda de segurança** no setup dos testes de integração: se o nome do banco em
   `DATABASE_URL` não terminar com `_test`, aborta com mensagem clara antes de qualquer
   limpeza. Ajuste o CI se o nome do banco de lá não seguir a regra.
5. Documentar no README (seção de testes).

Critérios de pronto:
- [ ] Prova: rodar `npm run db:seed`, depois `npm run test:integration`, e mostrar que o login
      demo (`demo@meister.com`) continua funcionando no banco de dev.
- [ ] Prova da guarda: apontar `DATABASE_URL` para o banco de dev e mostrar o teste abortando
      sem apagar nada.
- [ ] Suítes unitária e de integração verdes local e no CI.

Skills: `adversarial-architecture-qa` só no ponto da guarda (reproduzir o problema — teste
apagando o demo — antes de corrigir, e depois provar que não apaga mais).

---

## Etapa 3 — Validação de entrada em todas as rotas de escrita

**Branch:** `fix/validacao-de-entrada-nas-rotas`
**Por quê:** das 16 rotas de escrita, só educação e compliance validam o corpo na rota (potes
valida dentro do caso de uso). As demais recebem o corpo cru: corpo malformado tende a virar
**500** em vez de **400**.

Padrão único (decida no começo e aplique em todas):
- Schema **zod** exportado junto do caso de uso (camada `application`), como em
  `modules/jars/application/use-cases/UpdateJarPlanBaseMode.ts`, para valer também quando o
  caso de uso é chamado pelo Telegram, pelo assistente ou por workers.
- Erro de validação → `ValidationError` (400) com mensagem em português; nunca 500.
- Confirme como `src/shared/http-error-handler.ts` trata `ZodError` e ajuste se precisar
  (com teste).

Ordem (do maior risco para o menor), **um grupo de rotas por commit**:
1. `transactionRoutes` / `transferRoutes` (dinheiro)
2. `openFinanceRoutes` (importação de extrato, aprovação, conexão)
3. `receiptRoutes` (confirmação de nota com divisão)
4. `telegramRoutes` e `assistantRoutes`
5. `categoryRoutes`, `fiscalRoutes`, `insightRoutes`, `workspaceRoutes`, `userRoutes`, `authRoutes`
6. `jarsRoutes` — conferir `POST /jars/plan` e `PUT /jars/categories` (este já valida)

Para cada grupo:
- `module-hardening` nos arquivos de rota e nos casos de uso tocados (ledger, matriz de
  cenários de entrada: tipo errado, campo ausente, string vazia, número negativo, valor com
  vírgula, data inválida, id de outro workspace, array vazio, tamanho máximo).
- Testes de integração cobrindo os cenários da matriz (400 com mensagem, nunca 500).

Critérios de pronto:
- [ ] **Probe de fuzz** (`.claude/hardening/validacao-rotas/probes/fuzz-rotas.ts`): para cada
      rota de escrita, envia ~10 corpos malformados autenticado e registra os status.
      Evidência antes (lista de 500s) e depois (**zero respostas 500**).
- [ ] Mutation score ≥ 85% nos schemas/casos de uso tocados.
- [ ] Nenhuma mudança de contrato para corpos válidos (testes existentes intactos). Se algum
      campo passar a ser recusado, liste na tabela de contrato do PR.

---

## Etapa 4 — Revisões com evidência dos módulos ainda não revisados

Cada sub-etapa é **um módulo, uma branch, um PR**, entregue e aprovado antes da próxima.
Todas usam `module-hardening` completo + `adversarial-architecture-qa` nos pontos indicados.
Artefatos em `.claude/hardening/<modulo>/`.

### 4a — Open Finance / Pluggy (backend)
**Branch:** `review/openfinance-pluggy` · **Escopo:** `backend/src/modules/openfinance/**`,
`backend/src/routes/openFinanceRoutes.ts`.
Vetores mínimos da matriz:
- webhook do Pluggy: autenticação/assinatura, replay do mesmo evento, evento fora de ordem;
- sincronização: idempotência (mesma transação bancária importada duas vezes), paginação;
- importação de extrato: `externalId` estável, mesmo arquivo importado de novo, CSV/OFX malformados;
- aprovação: duas aprovações simultâneas do mesmo item (corrida, com Postgres real),
  aprovação em lote parcial com falha no meio, item de outro workspace;
- credenciais: nunca devolvidas ao cliente, nunca em log.

### 4b — Telegram e assistente (Gemini)
**Branch:** `review/telegram-assistente` · **Escopo:** `modules/assistant/**`, telegram,
`telegramRoutes.ts`, `assistantRoutes.ts`.
- webhook do Telegram: segredo obrigatório (`TELEGRAM_WEBHOOK_SECRET`), replay de `update_id`;
- token de vínculo: expiração, reuso, vínculo de um chat a dois workspaces;
- propostas de lançamento: só viram transação com confirmação explícita; confirmar proposta
  de outro usuário; confirmar duas vezes (corrida);
- injeção de prompt: mensagem tentando fazer o assistente criar lançamento sem confirmação,
  revelar dados de outro workspace ou mudar valor;
- Gemini fora do ar / sem chave: degradação para o modo local sem 500.

### 4c — Leitura de nota fiscal (`receipts`)
**Branch:** `review/receipts` · **Escopo:** `modules/receipts/**`, `receiptRoutes.ts`.
- divisão: soma das partes = total **em centavos** (sem float), arredondamento, parte zerada
  ou negativa;
- nota duplicada (mesma chave de acesso) e corrida de duas confirmações;
- falha do provedor de visão, imagem grande demais, resposta da IA malformada.

### 4d — Insights e alertas de limite
**Branch:** `review/insights-limite` · **Escopo:** `modules/insights/**`, alertas de limite
MEI (`modules/fiscal` no que gera alerta).
- regras: limites exatos (79,99% / 80% / 100% / 120%), proporcional ao mês de abertura,
  virada de ano e de mês no fuso de Brasília;
- deduplicação: o mesmo alerta não pode ser gerado duas vezes (inclusive em execução
  concorrente do job);
- insight de outro workspace / entidade.

### 4e — Autenticação
**Branch:** `review/autenticacao` · **Escopo:** `authRoutes.ts`, `userRoutes.ts`,
`middlewares/authMiddleware.ts`, geração e validação de JWT.
- política de senha, enumeração de e-mail (mesma resposta para e-mail existente e inexistente);
- limite de tentativas de login (probe com N tentativas seguidas);
- expiração do JWT, token adulterado, segredo fraco recusado na inicialização;
- workspace do token vs. recurso pedido (IDOR) em amostra de rotas.

Critérios de pronto de cada sub-etapa:
- [ ] Ledger de todos os arquivos do escopo com `ledger.sh --check` 100%.
- [ ] Matriz de cenários completa, com o que ficou fora explicado.
- [ ] Cada achado: probe reproduzindo **antes**, correção, probe **depois**, teste de regressão.
- [ ] Mutation score ≥ 85% no escopo, sobreviventes explicados.
- [ ] `RELATORIO.md` com nota de prontidão (rubrica da `adversarial-architecture-qa`).

---

## Etapa 5 — Dívidas técnicas conhecidas

Uma sub-etapa por branch/PR.

### 5a — Agregação dos relatórios no backend
**Branch:** `feat/resumo-de-relatorios`
- Endpoint de resumo por período (ex.: `GET /reports/summary?startDate&endDate&entityId`)
  devolvendo despesas por categoria, top despesas e pró-labore (`transferType = 'pro_labore'`),
  excluindo `transfer`, tudo em centavos/`Money`.
- `ReportsPage` passa a usar o endpoint; remove a paginação no navegador e o `MAX_PAGES`.
- `module-hardening` no novo caso de uso (unitário + integração com dados de borda: período
  vazio, virada de mês, transferência, pró-labore antigo sem categoria).

### 5b — Zerar os 33 avisos `set-state-in-effect` do lint
**Branch:** `refactor/estado-em-efeitos`
- Um componente por commit; padrão preferido: inicializar estado ao abrir (`key` no Sheet
  ou estado derivado) em vez de `setState` dentro de `useEffect`.
- Sem mudança de comportamento: conferir no navegador cada modal afetado (abrir, editar,
  fechar, reabrir) e registrar.
- Ao final, tornar o lint mais estrito no CI (falhar com aviso novo, se viável).

### 5c — Cabeçalhos HTTP de produção
**Branch:** `chore/headers-de-producao`
- **Pergunte ao usuário antes:** onde o frontend é servido em produção (Caddy, nginx, CDN,
  outro)? O `docker-compose.yml` não tem serviço de frontend e o repositório não tem config
  de servidor.
- Com a resposta, versionar a config com: `sw.js` → `Cache-Control: no-cache`;
  `/assets/*` → `public, max-age=31536000, immutable`; fallback de SPA; `/api` para o backend.
- Prova: `curl -I` dos três tipos de arquivo mostrando os cabeçalhos.

### 5d — Casos de borda do `RichText`
**Branch:** `fix/richtext-casos-de-borda`
- Linha de parágrafo começando com "2024. " não pode virar lista (exigir lista de verdade:
  linha anterior em branco ou lista anterior); listas numeradas respeitam o número inicial
  (`<ol start>`).
- Testes unitários do parser (extrair `parse` para `lib/` testável em `frontend/tests/`).

---

## Etapa 6 — Testes de ponta a ponta (Playwright)

**Branch:** `test/e2e-playwright`
- Playwright no frontend, rodando contra backend + Postgres de teste (banco `_test` da Etapa 2)
  e o build de produção (`vite preview`).
- Fluxos mínimos (um arquivo por fluxo):
  1. login demo → novo lançamento digitando "1.500" → aparece R$ 1.500,00 → excluir;
  2. potes: trocar a base para "mês anterior" pelo teclado → categorias preservadas;
  3. lição → quiz reprovado sem gabarito → quiz aprovado com gabarito;
  4. DAS: marcar como pago depois das 21h (relógio do navegador simulado em
     `America/Sao_Paulo`) com a data padrão;
  5. PWA: carregar online, ficar offline (`context.setOffline(true)`) e abrir `/potes`.
- Job novo no CI com os serviços necessários; artefato com traces/vídeos em falha.
- Critério: os 5 fluxos verdes no CI e cada um provado capaz de falhar (quebrar a asserção
  localmente uma vez e mostrar).

---

## Ordem e paradas

0 → 1 → 2 → 3 → 4a → 4b → 4c → 4d → 4e → 5a → 5b → 5c → 5d → 6

Depois de cada item: PR aberto, relatório entregue, **parar e esperar aprovação**.
Se surgir algo bloqueante fora do escopo (ex.: bug grave em outro módulo), **pare e avise**
em vez de corrigir por conta própria.
