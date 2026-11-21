# 15 — Família v1: convite do cônjuge, contas pessoais/compartilhadas e visão do casal

**Prioridade:** 🟢 épico (diferencial do produto; Fase 5 do planejamento)
**Donos:** DB → QA → Backend → Frontend
**Status:** PENDENTE. Depende das tarefas **17** (perfil e entidades por pessoa) e **18** (de quem é o gasto × quem pagou,
e acertos). Começar pela fase 0 (desenho) e validar com o dono antes de codar.

## A ideia, nas palavras do dono

A família no Meister é pensada para **casais em que um ou os dois têm negócio** (ex.: ela tem uma clínica, ele é
autônomo), mas também serve para casais e famílias sem negócio. O app precisa dividir certinho **de quem é o quê**:
se ela usa o cartão pessoal dele para comprar algo para a clínica, o gasto é da clínica e a clínica fica devendo a ele
(tarefa 18). No primeiro acesso o app pergunta qual é o caso e se autoconfigura (tarefa 17).

## Decisões do dono (entrevista de 2026-11-21)

| Tema | Decisão |
|---|---|
| Quem entra | **Cônjuge** (filhos/pais ficam para depois) |
| Login | **Misto**: o cônjuge tem login próprio; outros membros, no futuro, poderão ser só perfis |
| Privacidade | **Cada um escolhe**: cada conta é *pessoal* (só o dono vê) ou *compartilhada* (a família vê) |
| Permissões | **Papéis por pessoa**: dono (tudo), editor (lança e edita o compartilhado), leitor (só vê) |
| Visão do casal | Responder as quatro: **quanto a casa gastou**, **quem gastou o quê**, **quanto sobrou** e **metas/potes do casal** |
| MEI na família | **Só a retirada**: faturamento e despesas da PJ ficam separados; na família entra a transferência PJ → PF |
| Divisão de despesas | **Proporcional à renda** → fica para a **v2** (tarefa 16) |
| Escopo v1 | **Convite + privacidade + visão** |
| Cônjuge que já usa o Meister | **Traz os dados**: contas e lançamentos PF dele(a) entram na família como *pessoais* |
| Saída da família | **Leva o que é pessoal**; o compartilhado fica com o dono |
| Telegram | **Cada um vincula o próprio**; o que ele(a) manda vira lançamento dele(a) |
| Pagou com o cartão do outro | **Registra e cobra o acerto** (tarefa 18) |
| Quem classifica compra de conta compartilhada | **Qualquer um dos dois**; o outro vê o resultado |
| Negócio de cada um | Cada pessoa pode ter PJ (MEI ou outra) ou **atividade autônoma** (tarefa 17) |

## O que já existe

- `WorkspaceMember` com `role` (`owner | editor | viewer`) e `@@id([workspaceId, userId])` (`backend/prisma/schema.prisma:133`).
- Troca de workspace pelo cabeçalho `x-workspace-id` / claim `wid` (`backend/src/middlewares/authMiddleware.ts:31`).
- `Entity` com `kind` `pf | pj` por workspace; `Transaction.userId`; `TelegramLink` por usuário + workspace.
- `WorkspaceScope.defaultEntityIds` tem **uma** PF por workspace, o que não serve para um casal.

## O que falta (modelo)

1. **Dono da entidade PF:** `Entity.ownerUserId` (cada pessoa tem a própria PF dentro do workspace da família; PJ continua
   do dono do CNPJ).
2. **Visibilidade:** `visibility` = `pessoal | compartilhada` em `FinancialAccount` e `BankAccount` (padrão `pessoal`).
   Lançamento herda a visibilidade da conta; lançamento sem conta herda da entidade (PF pessoal por padrão).
3. **Convites:** tabela `workspace_invites` (e-mail, papel, token de uso único com hash, expiração, quem convidou, status).
4. **Escopo por membro:** `defaultEntityIds.pf` passa a ser a PF **do usuário logado** no workspace.

## Fases (um PR por fase, nesta ordem)

### Fase 0 — Desenho (sem código)
- Documento curto em `docs/familia.md`: modelo acima, regras de visibilidade por rota, migração de dados no aceite e na saída,
  impacto em cada módulo (ledger, dashboard, jars, insights, fiscal, telegram, openfinance, compliance/LGPD).
- Validar com o dono. Pontos a confirmar: o cônjuge vê a PJ? (decisão: **não**, a não ser que o dono compartilhe);
  potes do casal são de uma entidade nova "Casa" ou compartilhados entre as duas PFs?

### Fase 1 — DB (agente de DB)
- Migrations expandir → migrar → contrair: `Entity.ownerUserId` (preencher com o dono atual), `visibility` com padrão,
  `workspace_invites`. Índices para filtrar por `workspaceId + visibility + ownerUserId`.

### Fase 2 — Backend: convite e papéis
- `POST /api/workspace/invites` (só `owner`): e-mail + papel. Envio do link: hoje **não existe e-mail transacional**
  (ver tarefa 02); na v1 o dono copia o link e manda ao cônjuge.
- `POST /api/workspace/invites/:token/accept`: cria o `WorkspaceMember`, cria a PF do convidado no workspace
  (ou **traz** a PF da conta antiga dele(a), com contas e lançamentos como *pessoais*).
- `DELETE /api/workspace/members/:userId` (dono remove) e `POST /api/workspace/leave` (membro sai): quem sai **leva o pessoal**
  de volta para um workspace próprio; o compartilhado fica.
- Rate limit e token de uso único; convite expirado/usado → 410; e-mail diferente do convidado → 403.

### Fase 3 — Backend: privacidade em todas as leituras
- Regra única no repositório: membro vê o que é *compartilhado* + o que é *pessoal dele*. Recurso pessoal de outro membro → **404**.
- Aplicar em ledger, dashboard, relatórios, jars, insights, openfinance (Caixa de Revisão), receipts, exportação LGPD.
- Papel `viewer` não escreve; `editor` escreve no compartilhado e no pessoal dele.
- **Gate B obrigatório** (auditoria adversarial de autorização): IDOR entre cônjuges é o risco principal.

### Fase 4 — Backend: visão do casal
- `GET /api/family/overview?month=YYYY-MM`: total gasto pela casa por categoria (só compartilhado), gasto por pessoa,
  entradas − saídas do mês, saldo das contas compartilhadas, potes compartilhados com quanto cada um contribuiu.
- MEI: da PJ entra **só a retirada** (transferência PJ → PF); faturamento e despesas da PJ não aparecem.

### Fase 5 — Frontend
- Tela "Família": convidar (gerar link, escolher papel), membros e papéis, sair/remover.
- Em cada conta: alternar *pessoal / compartilhada*.
- Tela "Casa": as quatro respostas da visão do casal, com os acertos abertos entre as pessoas e os negócios (tarefa 18).
- Seletor de pessoa nas telas de lançamentos e relatórios.

### Fase 6 — Telegram
- Cada membro vincula o próprio Telegram ao workspace da família; lançamento pelo bot entra na PF dele(a), pessoal por padrão.

## Critério de pronto do épico

- [ ] Dono convida o cônjuge, ele(a) aceita, cada um conecta os próprios bancos.
- [ ] Conta pessoal de um não aparece para o outro em nenhuma tela nem rota (testado na Fase 3 e no Gate B).
- [ ] Tela "Casa" responde as quatro perguntas com dados reais.
- [ ] Sair da família devolve o pessoal e mantém o compartilhado.
- [ ] Tabela do `README.md` desta pasta atualizada.
