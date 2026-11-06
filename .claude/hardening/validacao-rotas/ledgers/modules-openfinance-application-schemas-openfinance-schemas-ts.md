# Ledger — backend/src/modules/openfinance/application/schemas/openfinance-schemas.ts (42 linhas)

Leia o arquivo inteiro com números de linha. Preencha cada bloco: o que as linhas fazem,
quais itens do checklist foram verificados, e o achado (`ok` ou `#id` com severidade).

| Linhas | O que fazem | Verificações (checklist) | Achado |
|---|---|---|---|
| 1-39 | Helper `optionalUuid` (L7): uuid opcional que aceita null e normaliza para undefined. Schemas de connect-item (L9-14: itemId 1..255, entityId), importação de extrato (L16-21: content 1..10 MiB, provider enum, institution ≤255, entityId), aprovação individual (L23-28) e item de lote (L30-34) com categoryId/entityId via optionalUuid; lote limitado a 500 itens (L36-38). | null vs ausente (ReviewInboxPage envia categoryId: null quando suggested_category_id é nulo); uuid estrito só quando preenchido; limite de tamanho alinhado ao bodyLimit de 10 MB do app.ts:39; enum de provider = valores aceitos pelo ImportStatement; transform não altera ids válidos (teste unitário). | ok — #1 corrigido neste commit (null era recusado com 400; tests/openfinance-approve-sem-sugestao.integration.test.ts falha antes e passa depois) |
| 40-42 | Schema do ignorar: só bankTransactionId uuid. | corpo do ReviewInboxPage.tsx:207 é exatamente { bankTransactionId } (caso 16 da suíte de contrato) | ok |

## Achados

<!-- ### #1 🔴|🟠|🟡 título — arquivo:linha / trecho / por que / teste que prova / correção -->


Revisado em 2026-11-06 após os commits bdad04b, 601fafd e 5770f0c (relido arquivo inteiro com números de linha).

## Mutação (Stryker, 2026-11-06)

`openfinance-schemas.ts` + `ledger-schemas.ts`: 113 mutantes, 112 mortos, **99,12%**.

- Sobreviventes da primeira rodada (97,37%): o `transform` de `optionalUuid` e do `entityId` do ledger
  trocado por `() => undefined` — faltava provar que um id preenchido é preservado. Testes adicionados em
  `validation-schemas.test.ts`; mutantes mortos.
- Sobrevivente restante, **equivalente**: L11 `.min(1, 'O itemId…')` → `.min(1, "")`. No zod 4 o `error`
  de `z.string({ error })` (L10) vale para todos os problemas do campo; com a mensagem do `min` vazia o zod usa
  a do schema, que é idêntica. Comportamento observável igual — não há teste que o distinga.
