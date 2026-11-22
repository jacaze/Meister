# Família no MEIster — desenho (tarefa 15, fase 0)

**Status:** validado pelo dono em 2026-11-21 (decisões na §9). Fase 1 (schema) feita; fases 2 a 8 pendentes.
**Base:** `develop` em `2058df8` (tarefas 14, 17 e 18 já mescladas).

## 1. A ideia

Casais em que um ou os dois têm negócio (ex.: ela tem uma empresa, ele é autônomo), mas também casais e famílias sem
negócio. Cada um tem login próprio, conecta os próprios bancos e escolhe o que é **pessoal** e o que é **compartilhado**.
O app divide certinho **de quem é cada gasto** e **com o dinheiro de quem foi pago** (tarefa 18), e mostra a visão da casa.

Decisões já tomadas pelo dono estão em `docs/tarefas/15-familia-v1.md`. Este documento diz **como** fazer.

## 2. O que já existe e serve

| Peça | Onde | Uso na família |
|---|---|---|
| Membros com papel `owner / editor / viewer` | `WorkspaceMember` | O cônjuge entra no mesmo workspace |
| Troca de workspace por requisição | `x-workspace-id` / claim `wid` (`authMiddleware.ts`) | Já resolve o escopo por workspace |
| Entidade com dono | `Entity.ownerUserId` (tarefa 17) | Cada pessoa tem a própria PF e os próprios negócios |
| Perfil `familia` / `familia_negocio` | `Workspace.profile` (tarefa 17) | Já escolhido no primeiro acesso |
| Conta bancária ligada a uma entidade | `BankAccount.entityId` (tarefa 14) | Define de quem é o dinheiro que sai da conta |
| Dono do gasto × pagador, acertos | `Transaction.paidByEntityId`, `Settlement` (tarefa 18) | Quem pagou o quê, e quem deve a quem |
| Telegram por pessoa e workspace | `TelegramLink(userId, workspaceId)` | Cada um vincula o próprio bot |

## 3. Modelo proposto

### 3.1 Um workspace da família, uma entidade "Casa"

- O casal vive em **um** workspace. Cada pessoa mantém a **própria PF** (`ownerUserId` = ela) e os **próprios negócios**.
- Nova entidade **`casa`** (`kind: 'casa'`, sem dono, compartilhada), criada quando o perfil é `familia*`. É onde moram
  as despesas e receitas da casa (mercado, aluguel, escola) e os **potes do casal**.
- Com a tarefa 18 isso fecha sozinho: o mercado é **da Casa**, pago com o **cartão dele** → acerto "Casa deve a João".
  Somando os acertos, o app sabe **quanto cada um colocou na casa** — base da v2 (contribuição proporcional, tarefa 16).

### 3.2 Duas camadas de visibilidade

O dono escolheu "cada conta é pessoal ou compartilhada". Para o caso "ela usa o cartão dele para a empresa dela" funcionar,
são precisas duas camadas independentes:

| Camada | Campo novo | Padrão | O que controla |
|---|---|---|---|
| **Entidade** | `Entity.visibility` = `pessoal \| compartilhada` | PF e negócios: `pessoal`; Casa: `compartilhada` | Quem vê os **lançamentos, potes, DAS, insights** daquela entidade |
| **Conta** | `BankAccount.visibility` e `FinancialAccount.visibility` = `pessoal \| compartilhada` | `pessoal` | Quem vê a **Caixa de Revisão** daquela conta (para os dois poderem classificar) |

Regras de leitura (uma função só, usada por todos os repositórios):

1. **Nomes** de todas as entidades do workspace são visíveis a todos os membros. Sem isso ninguém consegue marcar
   "este gasto é da empresa dela" nem ler "Casa deve a João". Os **dados** de uma entidade pessoal continuam fechados.
2. Um **lançamento** é visível se o membro pode ver a entidade dona **ou** a entidade pagadora é dele **ou** ele criou o
   lançamento. (Quem pagou com o próprio dinheiro sempre vê para onde o dinheiro foi.)
3. Um **acerto** é visível se o membro vê o lançamento de origem.
4. Um **item da Caixa de Revisão** é visível se a conta é compartilhada **ou** a entidade da conta é do membro.
5. **Papel não fura privacidade:** o `owner` do workspace **não** vê o pessoal do cônjuge. O papel só vale para o que é
   compartilhado (viewer não escreve; editor escreve no compartilhado e no próprio pessoal; owner também gerencia membros).
6. Recurso não visível responde **404**, nunca 403 (anti-IDOR, como no resto do app).

### 3.3 Escopo por requisição

`WorkspaceScope` passa a carregar, resolvido no `authMiddleware`:

- `defaultEntityIds.pf` = a PF **do usuário logado** (hoje é "a PF do workspace", que deixa de ser única);
- `visibleEntityIds` = entidades cujos dados o usuário pode ver;
- `ownEntityIds` = entidades das quais ele é dono.

Toda consulta de repositório usa um filtro único, por exemplo `visibleTransactionsWhere(scope)`. Nenhum módulo monta a
regra por conta própria.

### 3.4 Convites

Tabela nova `workspace_invites`: e-mail convidado, papel, hash do token (o token só aparece no link, uma vez), expiração
(7 dias), quem convidou, status `pendente | aceito | expirado | cancelado`.

- Sem e-mail transacional no backend hoje (tarefa 02): na v1 o dono **copia o link** e manda ao cônjuge.
- Aceitar exige estar logado com o **mesmo e-mail** do convite (senão 403); token usado ou expirado → 410.

## 4. Entrar na família (o cônjuge "traz os dados")

Decisão do dono: quem já usa o Meister **traz as contas e lançamentos PF como pessoais**. O aceite é **uma transação de
banco** que move o workspace antigo do convidado para o da família:

| Dado do convidado | O que acontece |
|---|---|
| Entidades (PF e negócios) | `workspaceId` → família; `ownerUserId` = convidado; `visibility = pessoal` |
| Lançamentos, splits, auditoria | Seguem a entidade. **Categoria** é remapeada pelo `slug` para a categoria da família (cria se faltar) |
| `sourceRef` (único por workspace) | Em conflito (ex.: a mesma NF-e lançada pelos dois), o do convidado ganha sufixo `:<id curto>`; nada se perde |
| Contas e conexões bancárias, itens da revisão | `BankConnection.workspaceId` → família; contas ficam `pessoal` |
| Potes, DAS, alertas de limite, regras de categorização | Seguem a entidade |
| Acertos | Seguem (já são entre entidades dele) |
| Notas fiscais (`FiscalReceipt`), propostas do assistente | Só têm `workspaceId`: movem junto (ver risco em §8) |
| Telegram | O vínculo passa a apontar para o workspace da família |
| Insights, lições, nudges, consentimentos | Ficam com o usuário; os de workspace são recalculados |
| Workspace antigo | Fica vazio e é **arquivado** (não apagado) — decisão pendente (§9) |

## 5. Sair da família (ou remover alguém)

Decisão do dono: **quem sai leva o que é pessoal; o compartilhado fica.** Também é uma transação de banco:

- Cria um workspace novo para quem sai e move para lá as **entidades de que ele é dono** (com lançamentos, potes, DAS),
  as **conexões bancárias** cujas contas são dele e o vínculo do Telegram.
- A **Casa** e tudo que é dela ficam. Lançamentos da Casa pagos com o dinheiro de quem saiu continuam na Casa, com o
  pagador apontando para uma entidade que não está mais no workspace.
- **Acertos abertos** entre quem sai e quem fica não podem atravessar workspaces — decisão pendente (§9).
- O dono do workspace não pode "sair"; precisa transferir a propriedade antes (fora da v1).

## 6. Visão da casa (tela "Casa")

`GET /api/family/overview?month=AAAA-MM`, só com o que é visível ao usuário:

| Pergunta | Cálculo |
|---|---|
| Quanto a casa gastou | Despesas da entidade **Casa** no mês, por categoria |
| Quem gastou o quê | Despesas da Casa agrupadas pela **entidade pagadora** (de qual pessoa saiu o dinheiro) |
| Quanto sobrou | Receitas − despesas da Casa no mês, mais o saldo das contas **compartilhadas** |
| Metas e potes do casal | Potes da Casa e quanto cada pessoa contribuiu (soma dos acertos/aportes por pagador) |

MEI só pela retirada (decisão do dono): faturamento e despesas dos negócios **não** entram na tela da casa; o que aparece
é o que a PF de cada um recebeu como retirada/pró-labore, se a pessoa tornar isso visível.

## 7. Impacto por módulo

| Módulo | Mudança |
|---|---|
| `workspace` | Convites, aceite com migração de dados, sair/remover, entidade Casa, escopo com `visibleEntityIds` |
| `ledger` (+ `services/transactionService.ts`) | Filtro de visibilidade em listar/obter/editar/apagar; pagador validado contra entidades do workspace |
| `openfinance` | Caixa de Revisão pela regra 4; classificar só para entidades visíveis ou do usuário |
| `jars` | Potes da Casa; potes pessoais só para o dono |
| `fiscal` | DAS e limite só para o dono do MEI (negócio pessoal por padrão) |
| `insights`, `education` | Calcular por usuário sobre o que ele vê; nunca vazar números do pessoal do cônjuge |
| `assistant`, `telegram` | Lançamento vai para a PF de quem mandou; perguntas ao assistente respondem só com o visível |
| `receipts` | Nota fiscal ganha `entityId`/`userId` para dar para filtrar (hoje só tem workspace) |
| `compliance` (LGPD) | Exportação traz só o que o usuário vê; excluir conta de um membro remove o pessoal dele e mantém o compartilhado |
| `dashboard` (legado) | Somatórios pelo filtro de visibilidade |
| Frontend | Tela Família (convidar, membros, sair), alternar pessoal/compartilhado em entidades e contas, tela Casa, seletor de pessoa |

## 8. Riscos

1. **IDOR entre cônjuges** é o risco principal. Mitigação: filtro único de visibilidade + **Gate B** (auditoria adversarial)
   com dois usuários reais tentando ler o pessoal um do outro em **todas** as rotas.
2. **Migração do aceite** mexe em muitas tabelas: precisa ser uma transação, testada com um workspace "cheio" (lançamentos,
   splits, potes, DAS, conexões, acertos) e com conflito de `sourceRef`.
3. Módulos que hoje só filtram por `workspaceId` (receipts, proposals, dashboard legado) vazam se esquecidos: a fase de
   privacidade precisa de uma checklist rota por rota.
4. Somatórios do painel e do limite MEI mudam de significado quando há duas PFs: testes de caracterização antes.

## 9. Decisões do dono (2026-11-21)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Onde fica o compartilhado | **Entidade "Casa"** (`kind: 'casa'`, compartilhada, sem dono) |
| 2 | Nomes das entidades visíveis aos dois | **Sim, só os nomes**; dados do pessoal continuam fechados |
| 3 | Dono do workspace vê o pessoal do cônjuge | **Não**: papel não fura privacidade |
| 4 | Sair com acertos abertos | **Bloquear até acertar** (ou o outro perdoar, que marca como acertado por abatimento) |
| 5 | Workspace antigo de quem entra | **Arquivado** vazio (não apagado) |
| 6 | Quem alterna conta pessoal ↔ compartilhada | **Só o dono da conta** (dono da entidade da conta) |

Com isso, a §5 passa a ser: sair exige **zero acertos abertos** entre quem sai e quem fica; a tela de saída lista os
abertos com atalho para a tela Acertos. Remover um membro segue a mesma regra.

## 10. Plano de PRs (depois da validação)

| Fase | PR | Dono |
|---|---|---|
| 1 ✅ | Schema: `Entity.visibility`, `BankAccount/FinancialAccount.visibility`, `kind: 'casa'`, `workspace_invites`, `FiscalReceipt.entityId` (expansão + backfill: tudo existente = pessoal) — **feita** (migration `20261122000000_familia_visibilidade_convites`) | DB |
| 2 | Escopo com `visibleEntityIds` + filtro único + testes de caracterização (sem mudar comportamento de quem está sozinho) | Backend |
| 3 | Convites e aceite com migração de dados | Backend |
| 4 | Privacidade em todas as rotas + **Gate B** | Backend + QA |
| 5 | Tela Casa (`/api/family/overview`) | Backend |
| 6 | Frontend: Família, Casa, pessoal/compartilhado, seletor de pessoa | Frontend |
| 7 | Sair/remover membro | Backend + Frontend |
| 8 | Telegram e assistente com a regra de visibilidade | Backend |

Cada fase com teste que falha antes, Gate 0 verde e, nas fases 3, 4 e 7, Gate B.

## 11. Fase 1 — o que entrou no schema

| Tabela | Coluna / objeto | Padrão | Observação |
|---|---|---|---|
| `entities` | `visibility` | `'pessoal'` | `CHECK IN ('pessoal','compartilhada')`; `kind` passa a aceitar `'casa'` (coluna texto) |
| `bank_accounts`, `financial_accounts` | `visibility` | `'pessoal'` | `CHECK IN ('pessoal','compartilhada')` |
| `workspaces` | `archived_at` | nulo | Workspace antigo de quem entrou na família (§4) |
| `fiscal_receipts` | `entity_id`, `user_id` | nulo | FK `SET NULL`. Backfill pelo lançamento com `source_ref = 'nfe:<chave>'` no mesmo workspace |
| `workspace_invites` | tabela nova | — | `token_hash` único, `status` e `role` com `CHECK`, apagado junto com o workspace |

Nenhum código lê esses campos ainda: o comportamento do app não muda. Os `CHECK` existem só no banco (o Prisma não os
representa), então o `migrate diff` continua sem diferença.
