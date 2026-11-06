# Ledger — backend/src/routes/jarsRoutes.ts (57 linhas)

Leia o arquivo inteiro com números de linha. Preencha cada bloco: o que as linhas fazem,
quais itens do checklist foram verificados, e o achado (`ok` ou `#id` com severidade).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-38 | imports e dependências do módulo; declarações exportadas (jarsRoutes); rotas HTTP (GET /jars/templates, GET /jars); validação de entrada com schema Zod | tipos estritos TypeScript, null/undefined checks, validação Zero Trust na borda (limites min/max, enums, UUIDs), rejeição de null/array/text-plain sem fallback ?? {}, tratamento de ZodError em PT-BR sem vazar payload | ok |
| 39-57 | validação de entrada com schema Zod | tipos estritos TypeScript, null/undefined checks, validação Zero Trust na borda (limites min/max, enums, UUIDs), rejeição de null/array/text-plain sem fallback ?? {}, tratamento de ZodError em PT-BR sem vazar payload | ok |

## Achados

Nenhum defeito remanescente após revisão linha a linha e validação com testes unitários, de integração e de mutação.
