# 05 — Ativar a Pluggy com conta real (MeuPluggy e produção)

**Prioridade:** 🔴 necessária para testar com banco real
**Donos:** Humano (painel da Pluggy) + Backend (documentação e checagem)
**Status:** BLOQUEADA até a tarefa 01 estar no `develop`.

## Contexto: não há "modo sandbox" no código

- O backend já chama a API real: `https://api.pluggy.ai` (`backend/src/modules/openfinance/infra/PluggyClient.ts:30`, sobrescrevível por `PLUGGY_BASE_URL`).
- O widget só lista os bancos de teste no dev server:
  `includeSandbox={Boolean(import.meta.env.DEV)}` em
  `frontend/src/components/openfinance/PluggyConnectFallbackModal.tsx:97`. No build de produção
  eles já somem.
- O que limita a bancos de teste é a **aplicação no painel da Pluggy**, ou seja, as credenciais
  `PLUGGY_CLIENT_ID/SECRET` usadas. Trocar isso é tarefa de painel, não de código.

## Caminho A: testar com a própria conta, sem custo (MeuPluggy)

Feito pelo humano:

1. Com o trial da Pluggy **ativo** (só funciona durante o trial), criar conta em https://meu.pluggy.ai
   e conectar lá o banco real.
2. No Meister rodando com as credenciais do trial, abrir Revisão → Conectar banco.
3. No widget, escolher o conector **MeuPluggy** e autorizar.
4. Conferir na Caixa de Revisão se contas e transações chegaram. O MeuPluggy funciona como proxy da
   conexão original e atualiza uma vez por dia.

## Caminho B: clientes reais (aplicação de produção)

1. No painel da Pluggy: Applications → **Go to production**. Envolve contrato e due diligence com a Pluggy.
2. Colocar as novas credenciais **somente** no `.env` de produção (nunca no repositório).
3. Cadastrar o webhook de produção (tarefa 09).

## O que o Backend faz nesta tarefa

1. Criar `docs/openfinance.md` com os dois caminhos acima, as variáveis envolvidas e o fluxo
   (connect token → widget → `onSuccess` com `itemId` → `POST /api/openfinance/connect-item`).
2. Validar `PLUGGY_BASE_URL` no `backend/src/shared/env.ts` (hoje é lida direto de `process.env`
   no `PluggyClient`): URL opcional, `https` obrigatório fora de dev/test.
3. Em `NODE_ENV=production`, se só uma das duas (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`)
   estiver preenchida, falhar no boot com mensagem clara.

## Teste que deve falhar antes

- Unitário de `env.ts`: produção com `PLUGGY_CLIENT_ID` preenchido e `PLUGGY_CLIENT_SECRET` vazio → erro de validação.
- Unitário de `env.ts`: produção com `PLUGGY_BASE_URL=http://...` → erro.

## Critério de pronto

- [ ] Testes de `env.ts` falharam antes e passam depois.
- [ ] `docs/openfinance.md` escrito.
- [ ] Humano conectou uma conta real via MeuPluggy e viu transações na Caixa de Revisão
      (anotar data e banco no PR, **sem** valores ou dados pessoais).
- [ ] Tabela do `README.md` desta pasta atualizada.

## Como foi resolvido (2026-11-21)

- `backend/src/shared/env.ts`: `PLUGGY_BASE_URL` validada (URL completa; `https` fora de dev/test; vazia
  conta como ausente) e par `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` obrigatório fora de dev/test.
  Testes em `backend/src/shared/__tests__/env-pluggy.test.ts`.
- `PLUGGY_BASE_URL` adicionada ao `.env.example`. **Agente da tarefa 02:** repasse-a no compose com `${PLUGGY_BASE_URL:-}`.
- `docs/openfinance.md` escrito.
- **Teste humano feito em 2026-11-21:** conta real do Santander conectada via MeuPluggy e transações importadas
  para a Caixa de Revisão. O teste revelou que o `clientUserId` ia fora de `options` no `POST /connect_token`
  (a Pluggy ignorava e o item nascia sem dono; `connect-item` respondia 404). Corrigido em
  `fix/pluggy-connect-token-client-user-id`.
- **Achado de produto:** todas as contas importadas vão para a entidade PJ, mesmo contas pessoais.
- Achado para tarefa futura: `DELETE /api/openfinance/connections/:id` não remove o item na Pluggy
  (o consentimento continua ativo lá). Registrado em `docs/openfinance.md`.
