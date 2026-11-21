# 10 — `DEMO_MODE`: remover ou implementar

**Prioridade:** 🟢
**Dono:** Backend
**Status:** PENDENTE. Precisa de **decisão do dono** antes de começar.

## Problema

`DEMO_MODE` vem **ligado por padrão** (`backend/src/shared/env.ts:67`, padrão `'true'`;
`.env.example:55`), mas nenhum código do backend ou do frontend lê essa variável. Uma flag que
parece ligar um "modo demonstração" e não faz nada confunde quem configura produção.

## Decisão necessária (pergunte ao dono e registre a resposta no PR)

- **A) Remover:** apagar de `env.ts`, `.env.example`, `docker-compose*.yml` e docs.
- **B) Implementar:** definir o que o modo faz (ex.: seed de dados fictícios, banner "demonstração",
  bloquear integrações reais) e mudar o padrão para `false`. Em `NODE_ENV=production` com
  `DEMO_MODE=true`, falhar no boot ou exigir confirmação explícita.

## Teste que deve falhar antes

- **A:** teste de `env.ts` confirmando que a chave não existe mais no schema exportado (e `grep -rn DEMO_MODE` vazio no PR).
- **B:** teste de `env.ts` em produção com `DEMO_MODE=true` → erro; e testes do comportamento escolhido.

## Critério de pronto

- [ ] Decisão registrada no PR.
- [ ] Nenhuma variável sem efeito sobrando.
- [ ] Tabela do `README.md` desta pasta atualizada.
