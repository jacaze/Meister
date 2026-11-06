# Ledger — backend/src/app.ts (120 linhas)

Leia o arquivo inteiro com números de linha. Preencha cada bloco: o que as linhas fazem,
quais itens do checklist foram verificados, e o achado (`ok` ou `#id` com severidade).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-35 | Imports de plugins e rotas; BuildAppOptions; z.config(z.locales.pt()) no início de buildApp. | z.config é global e idempotente (chamado a cada buildApp nos testes sem efeito colateral); mensagens do zod em português confirmadas no teste do error handler. | ok |
| 36-70 | parseEnv, Fastify com bodyLimit 10 MB, handler de correlação/erro, helmet sem CSP, CORS por lista, cookie, rate limit global 300/min, JWT HS256. | bodyLimit coerente com importStatementSchema; rate limit global não afeta o probe (0 respostas 429); algoritmo do JWT fixado em sign e verify. | ok — observação fora do escopo: rate limit é global, sem limite específico para /login (Etapa 4e) |
| 71-110 | Registro das rotas sob /api; telegramWebhookRoute registrado UMA vez, sem prefixo (/telegram/webhook); healthchecks /health, /health/live e /health/ready. | alias /api/telegram/webhook removido (commit 601fafd), teste garante via app.hasRoute que só /telegram/webhook existe; webhook continua exigindo o segredo (constantTimeEquals). | ok — #2 corrigido: segunda entrada pública do webhook removida |
| 111-120 | Fim do /health/ready: 503 quando o banco não responde; retorna a instância. | sem vazamento de erro do banco na resposta. | ok |

## Achados

<!-- ### #1 🔴|🟠|🟡 título — arquivo:linha / trecho / por que / teste que prova / correção -->


Revisado em 2026-11-06 após os commits bdad04b, 601fafd e 5770f0c (relido arquivo inteiro com números de linha).
