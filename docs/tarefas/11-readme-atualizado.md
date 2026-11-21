# 11 — Atualizar o README para a versão atual

**Prioridade:** 🟢
**Dono:** qualquer agente (só documentação)
**Branch sugerida:** `docs/readme-v1`

## Problema

O `README.md` da raiz descreve a **versão antiga**:

- Diz "Node.js, Fastify 5, **Prisma ORM 6**" e frontend em "**HTML + JavaScript**, Tailwind via CDN",
  com telas `dashboard.html`, `transactions.html`, `DAS.html`.
- A estrutura mostrada (`server.js`, `controllers/`, `services/` em JS) não é mais a arquitetura principal.
- Não cita Telegram, Gemini, Open Finance/Pluggy, potes, insights, educação, LGPD, Docker nem os gates de qualidade.

## O que fazer

1. Reescreva com base no código real (`CLAUDE.md`, `backend/package.json`, `frontend/package.json`,
   `backend/src/modules/*`, `frontend/src/pages/*`). Não invente funcionalidade: se não achou no código, não escreva.
2. Seções: o que é; funcionalidades por módulo; stack com versões do `package.json`;
   arquitetura (resumo + link para o `CLAUDE.md`); como rodar em dev (Docker e local);
   variáveis de ambiente (link para `.env.example`); testes e gates; deploy (link para `docs/deploy.md`
   da tarefa 03); Open Finance (link para `docs/openfinance.md` da tarefa 05).
3. Remova a duplicação atual ("Tipo de conta" aparece duas vezes na lista de funcionalidades).

## Verificação

Não há teste automatizado. No PR, liste cada afirmação de stack/funcionalidade com o arquivo que a comprova.

## Critério de pronto

- [ ] README sem referência à versão JS/HTML antiga.
- [ ] Todos os comandos citados rodam (cole a saída de pelo menos `docker compose up -d db` e `npm --prefix backend test`).
- [ ] Tabela do `README.md` desta pasta atualizada.
