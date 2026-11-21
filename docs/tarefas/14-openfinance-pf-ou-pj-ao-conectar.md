# 14 — Perguntar se cada conta bancária é PF ou PJ ao conectar

**Prioridade:** 🔴 (achado no teste com conta real: o Santander pessoal do dono caiu na PJ)
**Donos:** QA → Backend → Frontend
**Branch sugerida:** `feat/openfinance-pf-pj-por-conta`

## Problema

1. `connectPluggyItem` grava toda conta importada na entidade **PJ** por padrão
   (`backend/src/modules/openfinance/application/use-cases/ConnectPluggyItem.ts`,
   `targetEntityId = input.entityId || scope.defaultEntityIds.pj || scope.defaultEntityIds.pf`). O frontend nunca
   manda `entityId`, então para um MEI tudo vai para a PJ, inclusive contas pessoais.
2. Mesmo que a conta tivesse a entidade certa, a **aprovação ignora isso**: `ApproveImportedTransaction.ts` passa
   `entityId: input.entityId` ao `createTransaction`, e sem ele o ledger usa a entidade padrão
   (`ledger/application/use-cases/CreateTransaction.ts:97`). `BankAccount.entityId` não é consultado.
3. Não existe tela para ver ou trocar de qual entidade é cada conta bancária.

## Decisão do dono (2026-11-21)

Perguntar **depois** do widget da Pluggy: o app mostra as contas importadas e o usuário marca de quem é cada uma.
Dá para trocar depois na lista de bancos. O seletor lista as **entidades do workspace** (PF, PJ e, quando a tarefa 17
existir, atividade autônoma e as entidades do cônjuge), não só "PF/PJ" fixo.

## O que fazer

### Backend
1. Conta nova importada entra com `entityId = null` ("a classificar"), **não** na PJ. Conta já existente mantém a entidade.
   Exceção: workspace só com PF (pessoa física, sem PJ) → grava direto na PF, sem perguntar.
2. A resposta de `POST /api/openfinance/connect-item` passa a incluir `accounts: [{ id, name, kind, entityId }]`
   (ids do `BankAccount` do Meister, não da Pluggy) para o frontend montar a pergunta.
3. Rota nova `PATCH /api/openfinance/bank-accounts/:id` com `{ entityId }` (Zod; entidade precisa ser do workspace;
   conta de outro workspace → 404). Ao trocar a entidade, as `BankTransaction` ainda `nova` dessa conta seguem a nova
   entidade; as já aprovadas **não** mudam (registrar no contrato).
4. `GET /api/openfinance/connections` devolve as contas de cada conexão com `entityId`.
5. `ApproveImportedTransaction`: sem `entityId` no corpo, usar o `entityId` do `BankAccount` da transação.
   Conta ainda "a classificar" → 422 com mensagem clara ("Defina se a conta é PF ou PJ antes de aprovar").
6. Mesmo tratamento no `batch-approve`.
7. Contrato OpenAPI/`docs/openfinance.md` atualizados.

### Frontend
8. Depois do `onSuccess` do widget e da resposta do `connect-item`: passo "De quem são estas contas?" listando cada
   conta com seletor **Pessoal (PF)** / **Empresa (PJ)**. Salvar chama o `PATCH` para cada conta.
9. Na lista de bancos (`BankConnectionsCard`), mostrar a entidade de cada conta e permitir trocar.
10. Na Caixa de Revisão, itens de conta "a classificar" mostram o aviso e um atalho para classificar a conta.

## Testes que devem falhar antes

- Integração: MEI conecta item com 2 contas → as duas ficam com `entityId` nulo (hoje vão para a PJ).
- Integração: workspace só PF → conta vai direto para a PF.
- Integração: `PATCH` com entidade de outro workspace → 404; conta de outro workspace → 404.
- Integração: aprovar transação de conta marcada PF, sem `entityId` no corpo → lançamento na PF (hoje vai para a padrão).
- Integração: aprovar transação de conta "a classificar" → 422.
- Frontend: passo de classificação aparece após conectar e envia um `PATCH` por conta.

## Critério de pronto

- [ ] Testes acima falharam antes e passam depois; Gate 0 verde.
- [ ] Reconectar o MeuPluggy no ambiente local, marcar o Santander como PF e aprovar um lançamento: ele aparece na visão PF.
- [ ] Tabela do `README.md` desta pasta atualizada.
