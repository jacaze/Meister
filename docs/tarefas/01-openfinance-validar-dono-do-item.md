# 01 — Validar o dono do item da Pluggy antes de importar

**Prioridade:** 🔴 bloqueador de produção (vazamento de dados bancários entre usuários)
**Donos:** QA (teste) → Backend (correção) → Frontend (remover o campo manual)
**Branch sugerida:** `fix/openfinance-dono-do-item`

## Problema

`POST /api/openfinance/connect-item` aceita qualquer `itemId` vindo do cliente e importa as contas e
transações desse item para o workspace de quem chamou. Ninguém confere se o item pertence ao
usuário autenticado.

Todos os itens ficam na **mesma aplicação Pluggy** (as credenciais são do servidor), então
`GET /items/{id}` devolve o item de qualquer usuário. Basta conhecer o `itemId` de outra pessoa
para puxar o extrato dela. O frontend ainda oferece um campo para digitar o `itemId` à mão, o que
torna o ataque trivial.

Nota: `SyncPluggyConnection` usa o `itemId` já salvo numa conexão do próprio workspace, então
não é porta de entrada. Mas também passa por `connectPluggyItem`, e a validação vai protegê-lo
de qualquer jeito.

## Onde

- `backend/src/modules/openfinance/application/use-cases/ConnectPluggyItem.ts:33`: busca o item e segue sem validar.
- `backend/src/modules/openfinance/infra/PluggyClient.ts:158`: `fetchItem` não devolve `clientUserId`.
- `backend/src/modules/openfinance/application/ports/BankingAggregator.ts:9`: `PluggyItemInfo` não tem `clientUserId`.
- `backend/src/modules/openfinance/application/use-cases/CreateConnectToken.ts:17`: o token **já** é criado com `clientUserId: scope.actorUserId`. Esse é o dado que deve ser conferido na volta.
- `frontend/src/components/openfinance/PluggyConnectFallbackModal.tsx:24-39`: campo `manualItemId`.

## O que fazer

1. **QA:** escreva o teste antes (ver abaixo) e confirme que ele falha.
2. **Backend:**
   - Adicione `readonly clientUserId?: string` em `PluggyItemInfo` e preencha em `PluggyClient.fetchItem`
     a partir de `data.clientUserId`. Confirme o nome do campo na documentação da Pluggy
     (objeto *Item*) antes de codar.
   - Em `connectPluggyItem`, logo depois do `fetchItem` e **antes de qualquer escrita no banco**:
     se `item.clientUserId` estiver ausente ou for diferente de `scope.actorUserId`, lance
     `NotFoundError` (404, regra anti-IDOR do `CLAUDE.md`, sem revelar que o item existe).
   - Se um item já estiver conectado em **outro** workspace (mesmo `provider` + `itemId`), também recuse
     com 404. Hoje a busca só olha o workspace atual, então dois workspaces poderiam compartilhar o item.
     Se precisar de índice único `(provider, item_id)` no schema, **não edite o Prisma**: registre o
     pedido para o agente de DB no PR.
   - Não logue o `itemId` nem o `clientUserId` de terceiros.
3. **Frontend:** remova o campo de `itemId` manual do `PluggyConnectFallbackModal` (ou deixe-o só
   com `import.meta.env.DEV`). O fluxo normal é o `onSuccess` do widget.
4. Atualize o contrato OpenAPI (`docs/api/**`) com a resposta 404 em `/openfinance/connect-item`.

## Teste que deve falhar antes

Teste de integração em `backend/tests/openfinance-dono-do-item.integration.test.ts` (Postgres real,
mesmo padrão de `openfinance.integration.test.ts`), com um `BankingAggregator` falso injetado:

- Usuário A chama `connect-item` com um item cujo `clientUserId` é o id do usuário B → **404** e
  nenhuma linha nova em `bank_connections`, `bank_accounts` ou `bank_transactions`.
- Item sem `clientUserId` → 404, nada gravado.
- Item com `clientUserId` = usuário A → 201 e importação normal (garante que a correção não quebrou o caminho feliz).
- Item já conectado no workspace de B, A tenta conectar com `clientUserId` forjado = A → definir e testar o comportamento (404 esperado).

Teste unitário em `PluggyClient`: `fetchItem` mapeia `clientUserId` da resposta.

## Critério de pronto

- [ ] Os testes acima falharam antes (saída no PR) e passam depois.
- [ ] Nenhuma escrita no banco acontece antes da checagem de dono.
- [ ] Campo manual de `itemId` removido da UI de produção.
- [ ] OpenAPI atualizado; Gate 0 verde.
- [ ] Tabela do `README.md` desta pasta: 01 marcada como FEITA.
