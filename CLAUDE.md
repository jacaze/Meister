# MEIster

Gestão financeira para MEI e Pessoa Física com lançamento via Telegram + IA, controle de limite anual proporcional, DAS, potes financeiros por porcentagem, educação financeira, insights determinísticos e Open Finance.

## Comandos principais
- **Subir ambiente completo (Docker):** `docker compose up --build`
- **Banco de desenvolvimento (Docker):** `docker compose up -d db`
- **Backend — Typecheck:** `npm --prefix backend run typecheck`
- **Backend — Lint:** `npm --prefix backend run lint`
- **Backend — Testes unitários e propriedades:** `npm --prefix backend test`
- **Backend — Testes de integração (Postgres real):** `npm --prefix backend run test:integration`
- **Backend — Testes de mutação (Stryker):** `npm --prefix backend run mutation`
- **Migrations (dev):** `npm --prefix backend run db:migrate:dev`
- **Migrations (CI/prod):** `npm --prefix backend run db:migrate:deploy`
- **Frontend — Dev:** `npm --prefix frontend run dev`
- **Frontend — Build & Typecheck:** `npm --prefix frontend run build`

## Arquitetura (Clean Architecture + Modular Monolith)
- **Dependência estrita:** `infra → application → domain`. `domain/` nunca importa Prisma, Fastify, Telegram, Pluggy ou SDKs externos.
- **Fronteiras de módulos:** Um módulo só pode importar `modules/<outro>/public.ts`. Nunca importe `infra/` de outro módulo.
- **Portas e adaptadores:** Integrações externas ficam atrás de portas (`MessagingChannel`, `BankDataProvider`, `LlmExtractor`, `LlmGateway`, `FiscalReceiptProvider`, `EmailSender`, `Clock`, `RateLimiter`, `JobQueue`).
- **Isolamento multi-tenant (`WorkspaceScope`):** Toda consulta ou mutação de repositório exige `WorkspaceScope` resolvido a partir da autenticação. Recursos de outro workspace retornam `404` (anti-IDOR).
- **Dinheiro (`Money`):** Representado em centavos inteiros (`bigint`) no domínio e `Decimal(14,2)` no banco. Proibido usar `number` (float) para somas ou rateios. Rateios usam o método do maior resto (`Money.allocate`).
- **Tempo (`Clock` / `LocalDate`):** Sempre injetável e interpretado no fuso `America/Sao_Paulo` para regras de dia/mês/ano fiscal.

## Regras duras (inegociáveis)
1. **Unicidade de escrita no Ledger:** `assistant`, `telegram` e `openfinance` nunca gravam em `transactions` diretamente; sempre chamam `ledger.CreateTransaction`.
2. **Zero Trust & Segredos:** Nenhum segredo padrão em código (`JWT_SECRET` validado no boot com mínimo de 32 bytes). Nunca logar senhas, tokens, CPF/CNPJ, itens de nota ou valores financeiros.
3. **Contratos primeiro:** Mudou contrato HTTP (OpenAPI), evento ou schema Prisma -> liste os impactos no PR.
4. **TDD & Evidência:** Teste novo precisa falhar antes da implementação. Não enfraqueça asserções para fazer o teste passar.
5. **Fluxo Git:** Branches `feat/*` e `fix/*` saem de `develop` e voltam para `develop`. `main` é exclusiva para produção/release.

## Donos de arquivo e Gates de Qualidade
- **DB:** `backend/prisma/**`, `docs/db/**`
- **Backend:** `backend/src/**` (exceto `*.test.ts`), `docs/api/**`
- **Frontend:** `frontend/**` (exceto testes)
- **QA/Testes:** `**/*.test.ts`, `backend/tests/**`, `evals/**`, `stryker.config.*`
- **DevOps:** `docker/**`, `docker-compose*.yml`, `Dockerfile*`, `.github/**`
- **Gates:**
  - **Gate 0 (CI):** `typecheck`, `lint`, `test`, `build`, `npm audit`, `gitleaks`.
  - **Gate A (`module-hardening`):** Revisão linha a linha com ledger 100%, matriz de cenários e mutação ≥ 80% no domínio/aplicação.
  - **Gate B (`adversarial-architecture-qa`):** Auditoria adversarial com sistema em execução real (vetores V1–V12).
