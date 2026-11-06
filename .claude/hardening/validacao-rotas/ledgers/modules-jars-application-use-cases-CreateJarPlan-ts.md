# Ledger — backend/src/modules/jars/application/use-cases/CreateJarPlan.ts (150 linhas)

Leia o arquivo inteiro com números de linha. Preencha cada bloco: o que as linhas fazem,
quais itens do checklist foram verificados, e o achado (`ok` ou `#id` com severidade).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-34 | imports e dependências do módulo; declarações exportadas (CreateJarPlanInput, createJarPlan); validação de entrada com schema Zod | tipos estritos TypeScript, null/undefined checks, validação Zero Trust na borda (limites min/max, enums, UUIDs), invariantes de domínio antes de mutação no banco, isolamento multi-tenant por workspaceId | ok |
| 35-71 | lançamento de erros de domínio tipados | tipos estritos TypeScript, null/undefined checks, invariantes de domínio antes de mutação no banco, isolamento multi-tenant por workspaceId | ok |
| 72-111 | operações de persistência Prisma com escopo de workspace; lançamento de erros de domínio tipados | tipos estritos TypeScript, null/undefined checks, invariantes de domínio antes de mutação no banco, isolamento multi-tenant por workspaceId | #1 🔴 corrigido (validação movida para antes de desativar plano ativo) |
| 112-150 | operações de persistência Prisma com escopo de workspace | tipos estritos TypeScript, null/undefined checks, invariantes de domínio antes de mutação no banco, isolamento multi-tenant por workspaceId | ok |

## Achados

### #1 🔴 Desativação prematura do plano ativo antes de validar entrada — `CreateJarPlan.ts:44-82`
- **Causa:** `prisma.jarPlan.updateMany({ data: { active: false } })` executava antes de validar `baseMode`, `templateSlug` e a soma de 100% dos potes.
- **Correção:** Validação Zod (`createJarPlanSchema`) e resolução dos potes movidas para antes da transação que desativa os planos anteriores.
- **Prova:** `backend/tests/jars-validation.integration.test.ts`.
