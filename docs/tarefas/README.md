# Tarefas para produção — MEIster

Levantamento feito em 2026-11-21 sobre o `develop` em `46e2043` (merge do PR #4,
`fix/validacao-de-entrada-nas-rotas`). As referências arquivo:linha valem para esse commit. Cada arquivo desta pasta é **uma** tarefa, escrita para o
agente que vai executá-la: problema, onde está (arquivo:linha), o que fazer, teste que deve falhar
antes e critério de pronto.

## Regras para quem pegar uma tarefa

- Leia o `CLAUDE.md` da raiz antes de começar. Ele manda em caso de conflito com este texto.
- **Uma tarefa por branch/PR.** Branch `fix/*` ou `feat/*` saindo de `develop` e voltando para `develop`.
  Nunca commite em `main`.
- Respeite os donos de arquivo do `CLAUDE.md`. Se a tarefa exige mexer em área de outro agente
  (schema Prisma, `docker-compose.yml`, testes), faça só a sua parte e deixe anotado no PR o que
  falta para o outro agente.
- TDD: o teste novo precisa **falhar antes** da correção. Cole a saída da falha no PR.
- Gate 0 (`typecheck`, `lint`, `test`, `test:integration`, `build`) verde antes do PR.
- No mesmo PR, marque a tarefa como **FEITA** na tabela abaixo.
- Tarefas **BLOQUEADAS** não devem ser começadas. O motivo está na tabela.

## Ordem sugerida e status

| # | Tarefa | Dono | Prioridade | Status |
|---|---|---|---|---|
| 01 | [Validar o dono do item da Pluggy antes de importar](01-openfinance-validar-dono-do-item.md) | QA → Backend → Frontend | 🔴 bloqueador | FEITA |
| 02 | [Repassar as variáveis das integrações no docker-compose](02-compose-variaveis-das-integracoes.md) | DevOps | 🔴 bloqueador | FEITA |
| 03 | [Publicar o frontend com proxy reverso e HTTPS](03-deploy-frontend-proxy-https.md) | DevOps | 🔴 bloqueador | FEITA |
| 04 | [Promover `develop` → `main` (release)](04-git-promover-develop-para-main.md) | Humano | 🔴 bloqueador | PENDENTE |
| 05 | [Ativar a Pluggy com conta real (MeuPluggy e produção)](05-pluggy-conta-real.md) | Humano + Backend (doc) | 🔴 bloqueador para testar | FEITA |
| 06 | [Paginação da Pluggy sem corte silencioso](06-pluggy-paginacao-sem-corte.md) | QA → Backend | 🟡 | FEITA |
| 07 | [Valores da Pluggy convertidos com `Money`, sem float](07-pluggy-valores-com-money.md) | QA → Backend | 🟡 | PENDENTE |
| 08 | [Rotina interna agendada (tick): DAS e sincronização bancária](08-rotina-interna-tick.md) | QA → Backend → DevOps | 🟡 | PENDENTE |
| 09 | [Webhook da Pluggy](09-pluggy-webhook.md) | QA → Backend | 🟡 | BLOQUEADA até 08 |
| 10 | [`DEMO_MODE`: remover ou implementar](10-demo-mode.md) | Backend | 🟢 | PENDENTE (decisão do dono) |
| 11 | [Atualizar o README para a versão atual](11-readme-atualizado.md) | Qualquer agente | 🟢 | PENDENTE |
| 12 | [Integra MEI (SERPRO): gerar DAS e gerir o MEI pelo app](12-integra-mei-serpro.md) | Humano → DB → Backend → Frontend | 🟢 épico | BLOQUEADA (contrato SERPRO + certificado) |
| 13 | [Confiar no proxy reverso (`TRUST_PROXY`)](13-backend-trust-proxy.md) | Backend | 🔴 bloqueador | FEITA |
| 14 | [Perguntar se cada conta bancária é PF ou PJ ao conectar](14-openfinance-pf-ou-pj-ao-conectar.md) | QA → Backend → Frontend | 🔴 | FEITA |
| 15 | [Família v1: convite do cônjuge, contas pessoais/compartilhadas e visão do casal](15-familia-v1.md) | DB → QA → Backend → Frontend | 🟢 épico | PENDENTE (desenho validado em docs/familia.md; próximo: fase 1) |
| 16 | [Família v2: contribuição proporcional à renda](16-familia-v2-proporcional.md) | — | 🟢 | BLOQUEADA até 15 |
| 17 | [Perfil no primeiro acesso: o app pergunta o caso e se autoconfigura](17-onboarding-por-perfil.md) | DB → QA → Backend → Frontend | 🟡 | FEITA |
| 18 | [De quem é o gasto × com o que foi pago, e acertos](18-pago-por-outra-entidade-e-acertos.md) | DB → QA → Backend → Frontend | 🟡 | FEITA (v1; saldo de caixa por entidade pendente) |

### Por que cada bloqueio

- **05**: conectar uma conta real antes da 01 expõe o extrato a qualquer usuário que conheça o `itemId`.
- **09**: webhook precisa de URL pública com HTTPS (03) e reaproveita o caso de uso de sincronização da 08.
- **10**: precisa que o dono diga se existe um "modo demonstração" planejado.
- **12**: depende de contrato pago com o SERPRO e de decidir de quem é o certificado e-CNPJ (ver o arquivo).
