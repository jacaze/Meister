# 12 — Integra MEI (SERPRO): gerar DAS e gerir o MEI pelo app

**Prioridade:** 🟢 épico (evolução de produto)
**Donos:** Humano (contrato e decisão) → DB → Backend → Frontend → QA
**Status:** BLOQUEADA até o humano resolver os pré-requisitos abaixo.

## Situação atual

A tela do DAS só **redireciona** para o PGMEI da Receita:

- `backend/src/modules/fiscal/application/use-cases/ListDas.ts:23` e `:85`: `pgmeiUrl` fixo.
- `frontend/src/pages/DasPage.tsx:268`: botão "Gerar no PGMEI".
- O app já calcula e agenda o DAS (`modules/fiscal/domain/services/DasCalculator.ts`, `DasScheduler.ts`)
  e guarda as cobranças em `DasCharge` (`backend/prisma/schema.prisma:321`), mas o valor é estimado
  e o pagamento é marcado à mão (`MarkDasPaid.ts`).

## O que a integração permite

A API **Integra MEI**, do pacote **Integra Contador** do SERPRO/Receita Federal, permite, entre outros:

- gerar o DAS do MEI (PDF, código de barras e Pix) direto no app;
- consultar débitos/dívida do MEI;
- transmitir a declaração anual (DASN-SIMEI);
- emitir o CCMEI.

O agente deve confirmar na documentação oficial do Integra Contador a lista exata de serviços,
os códigos de cada um e o formato das chamadas antes de implementar.

## Pré-requisitos (humano) — motivo do bloqueio

1. **Contrato com o SERPRO** para o Integra Contador (cobrança por consulta). Gera as credenciais
   de acesso (consumer key/secret).
2. **Certificado digital e-CNPJ** para autenticar as chamadas. Decisão de modelo:
   - **Recomendado:** o certificado é da empresa dona do app (ex.: o escritório de contabilidade), e
     cada MEI concede uma **procuração eletrônica no e-CAC** para esse CNPJ. Só um certificado é
     guardado no servidor.
   - Alternativa: cada MEI envia o próprio e-CNPJ. Mais atrito e muito mais risco de segurança.
3. Definir onde o certificado e a senha ficam em produção (cofre de segredos / variável de ambiente
   com o `.pfx` em base64, nunca no banco nem no repositório).
4. Definir como o app confirma que o MEI deu a procuração (o Integra Contador tem serviço de
   consulta de procurações) e o texto de consentimento LGPD que o usuário aceita.

Registre as decisões neste arquivo (seção "Decisões") antes de destravar.

## Fases (cada fase = um PR, na ordem)

### Fase 1 — DB
- Campos/tabelas para: CNPJ do MEI validado no `Workspace`/`Entity` (já existe `cnpj` em
  `schema.prisma:151`, confira se serve), status da procuração (`pendente | ativa | revogada`,
  data de verificação), e em `DasCharge`: `source: 'integra_mei'`, código de barras, linha digitável,
  Pix copia-e-cola, URL/armazenamento do PDF, data de geração.
- Migration segura (expandir → migrar → contrair).

### Fase 2 — Backend: porta e adaptador
- Porta nova em `modules/fiscal/application/ports/`, ex.: `MeiTaxGateway` com
  `gerarDas(cnpj, competencia)`, `consultarDebitos(cnpj)`, `verificarProcuracao(cnpj)`.
  `domain` não importa nada do SERPRO.
- Adaptador `modules/fiscal/infra/IntegraContadorClient.ts`: autenticação OAuth2 + mTLS com o
  certificado, timeout, retry com backoff só em erro transitório, mapeamento de erros para `DomainError`.
- **Nunca** logar CNPJ completo, valores, PDF ou tokens (regra 2 do `CLAUDE.md`).
- Adaptador falso para testes e dev (sem chamar o SERPRO).
- Variáveis novas em `.env.example` e `env.ts` (credenciais, caminho/base64 do certificado,
  senha, ambiente de homologação vs produção do SERPRO). Integração desligada se não configurada.

### Fase 3 — Backend: casos de uso e rotas
- `GerarDasOficial`: gera o DAS da competência, grava em `DasCharge` e devolve PDF/código/Pix.
  Idempotente por competência (não gerar duas vezes se já houver guia válida).
- `ConsultarDebitosMei` e `VerificarProcuracao`.
- Rotas em `fiscalRoutes.ts`, todas com `WorkspaceScope` e só para contas MEI. Rate limit por
  workspace (cada chamada custa dinheiro). OpenAPI atualizado.
- Manter o `pgmeiUrl` como **fallback** quando a integração estiver desligada ou a procuração pendente.

### Fase 4 — Frontend
- Na `DasPage`: botão "Gerar DAS" que mostra PDF, linha digitável (copiar) e Pix copia-e-cola (QR).
- Card de débitos em aberto.
- Fluxo de onboarding da procuração: passo a passo do e-CAC + botão "Já concedi, verificar".
- Estado de fallback com o link do PGMEI.

### Fase 5 (opcional) — DASN-SIMEI
- Pré-preencher a declaração anual com o faturamento do ledger e transmitir após confirmação do usuário.

## Testes que devem falhar antes (por fase)

- Fase 2: adaptador com servidor HTTP falso: autenticação, mapeamento de erro do SERPRO, timeout,
  e que nenhum log contenha o CNPJ.
- Fase 3: integração com adaptador falso: conta PF → 403/404; procuração pendente → resposta com fallback;
  gerar duas vezes a mesma competência → uma guia só; workspace B não vê guia do A (404).
- Fase 4: teste da página com API mockada para os estados gerado / pendente / fallback.

## Critério de pronto do épico

- [ ] Decisões dos pré-requisitos registradas abaixo.
- [ ] Um MEI real (de teste, com procuração) gerou o DAS pelo app em homologação e depois em produção.
- [ ] Gate A e Gate B aplicados no módulo `fiscal`.
- [ ] Tabela do `README.md` desta pasta atualizada.

## Decisões

_(preencher pelo humano)_

- Contrato SERPRO: —
- Dono do certificado e-CNPJ: —
- Onde o certificado fica guardado: —
- Texto de consentimento LGPD: —
