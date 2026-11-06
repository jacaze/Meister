# Ledger — src/shared/scope.ts (37 linhas)

> Mudou em `dbb0c7b` (linha 25). Lido de novo por inteiro.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-37 | tipos `WorkspaceRole`/`WorkspaceScope`; `assertAuthenticated`; `assertCanWrite` agora **lista de permissão** (`owner` \| `editor`); `assertOwner` | §9 S1 corrigido: papel desconhecido → `ForbiddenError` (provado P-S1). Resta: papel vem do banco como `String` sem CHECK e entra por `member.role as WorkspaceRole` (`ResolveScope.ts:64`) — agora falha **fechado**, então é só higiene | S2 🟡 |

## Achados
### S1 ✅ (corrigido) `assertCanWrite` falhava aberto para papel desconhecido
### S2 🟡 Papel sem validação na origem (cast + coluna sem CHECK) — ResolveScope.ts:64, schema.prisma:131
