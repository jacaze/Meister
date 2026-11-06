# Ledger — src/shared/errors.ts (82 linhas)

> Arquivo **idêntico** ao revisado em `0b21ac9` (`git diff 0b21ac9 7660a62` vazio). Leitura linha a linha reaproveitada; achados reavaliados contra o código atual.

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-35 | `DomainError` (code, statusCode, details; `name = new.target.name`), `ValidationError` 400, `UnauthorizedError(message, code)` 401 | §5 tipos distinguíveis; `details` não vaza stack; a ordem de argumentos de `UnauthorizedError` é (message, code) — `telegramRoutes` chama invertido (fora de escopo) | ok |
| 36-74 | `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `RateLimitedError` 429 | §5 não há mapeamento para erros do Prisma: em `http-error-handler.ts:32-46` tudo que não é `DomainError` com 4xx vira 500 e o objeto `err` inteiro é logado. P2002 agora é tratado no create (CT3 corrigido), mas P2025 e `PrismaClientValidationError` continuam → 500 (provado em TS5) | E1 🟠 |
| 75-82 | `ExternalServiceError` 503 | ok; não usado pelo ledger | ok |

## Achados

### E1 🟠 Erros do Prisma viram 500 genérico e são logados inteiros — http-error-handler.ts:32-46
- **Por que:** `PrismaClientValidationError` inclui na mensagem os argumentos da query (valores, descrições) → vão para o log (viola "nunca logar valores financeiros"); cliente recebe 500 em vez de 400/404/409.
- **Prova:** `PUT /api/transactions/:id` com `type` em lançamento sem categoria → 500 (probe TS5, atual).
- **Correção:** mapear `PrismaClientKnownRequestError` (P2002→409, P2025→404, P2003→400) e `PrismaClientValidationError`→400 no handler, com `redact` do erro no log. Fora do módulo — anotação.
