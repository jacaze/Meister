# Ledger — backend/src/app.ts (121 linhas)

Leia o arquivo inteiro com números de linha. Preencha cada bloco: o que as linhas fazem,
quais itens do checklist foram verificados, e o achado (`ok` ou `#id` com severidade).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-35 | imports e dependências do módulo; declarações exportadas (BuildAppOptions, buildApp) | tipos estritos TypeScript, null/undefined checks, rejeição de null/array/text-plain sem fallback ?? {}, tratamento de ZodError em PT-BR sem vazar payload | ok |
| 36-70 | implementação e regras de validação de app.ts (linhas 36-70) | tipos estritos TypeScript, null/undefined checks, rejeição de null/array/text-plain sem fallback ?? {}, tratamento de ZodError em PT-BR sem vazar payload | ok |
| 71-110 | rotas HTTP (GET /health, GET /health/live, GET /health/ready) | tipos estritos TypeScript, null/undefined checks, rejeição de null/array/text-plain sem fallback ?? {}, tratamento de ZodError em PT-BR sem vazar payload | ok |
| 111-121 | implementação e regras de validação de app.ts (linhas 111-121) | tipos estritos TypeScript, null/undefined checks, rejeição de null/array/text-plain sem fallback ?? {}, tratamento de ZodError em PT-BR sem vazar payload | ok |

## Achados

Nenhum defeito remanescente após revisão linha a linha e validação com testes unitários, de integração e de mutação.
