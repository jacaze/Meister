# 16 — Família v2: contribuição proporcional à renda

**Prioridade:** 🟢
**Status:** BLOQUEADA até a tarefa 15.

## Decisão do dono (2026-11-21)

As despesas da casa são divididas **proporcionalmente à renda**: cada um contribui com um percentual da própria renda
para as contas compartilhadas, e o app acompanha se cada um está em dia.

## A detalhar antes de começar

- O que conta como renda de cada um (salário, retirada do MEI, outras receitas da PF)? Mês corrente ou média?
- Percentual automático (renda de cada um ÷ renda do casal) ou definido manualmente?
- Como o app mostra "quem está devendo quanto" e como se registra o acerto (transferência entre as PFs)?
- Rateio com `Money.allocate` (maior resto), nunca float.
