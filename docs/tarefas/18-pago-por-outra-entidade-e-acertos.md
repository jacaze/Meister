# 18 — De quem é o gasto × com o que foi pago, e acertos

**Prioridade:** 🟡 (vale para o MEI sozinho; é a peça central da família com negócio)
**Donos:** DB → QA → Backend → Frontend
**Branch sugerida:** `feat/acertos-entre-entidades`

## Problema

O lançamento tem uma entidade só (`Transaction.entityId`). Quando a despesa é de uma entidade mas foi paga com a conta
de outra, o app só guarda um sim/não, `viaPersonalAccount` (`backend/prisma/schema.prisma:254`), usado num insight de
"mistura PF/PJ" (`insights/infra/PrismaFinancialSnapshotReader.ts:147`). Não sabe **de quem** era o cartão nem que surgiu
uma dívida entre as entidades.

Exemplo do dono: a esposa compra material da **empresa dela** (no exemplo, uma clínica) com o **cartão pessoal do marido
(PF dele)**. O gasto é da empresa; o dinheiro saiu do marido; a empresa fica devendo ao marido.

> **Os exemplos são ilustrativos.** "Clínica" é só um caso: pode ser qualquer empresa (MEI ou outra PJ) ou atividade
> autônoma, de qualquer pessoa da família, em qualquer direção (ele pagando pela empresa dela, ela pela dele, a empresa
> pagando algo pessoal). Nada no código pode depender de ramo de atividade, gênero ou de quem é o dono.


## Decisões do dono (2026-11-21)

- **Registra e cobra o acerto:** a despesa entra na entidade dona do gasto, o pagamento sai da conta que pagou, e o app
  mostra "<entidade devedora> deve R$ X a <entidade credora>" (ex.: "Clínica deve R$ X ao João") até alguém marcar como acertado (transferência ou abatimento).
- **Qualquer um dos dois classifica:** compra importada de uma conta **compartilhada** aparece na Caixa de Revisão dos
  dois; quem souber diz de quem é o gasto e o outro vê o resultado. Conta **pessoal** continua visível só para o dono,
  que pode classificar o gasto como de outra entidade (gera o acerto do mesmo jeito).

## O que fazer

1. **DB:** no lançamento, separar **entidade dona** (`entityId`, já existe) de **conta pagadora**
   (`paidFromAccountId` → `FinancialAccount`/`BankAccount`, cuja entidade pode ser outra). Tabela `settlements` (acertos):
   devedora, credora, valor (`Decimal(14,2)`), lançamento de origem, status `aberto | acertado`, como foi acertado
   (transferência vinculada ou abatimento), datas. Migrar `viaPersonalAccount = true` para um acerto aberto PJ → PF
   do dono (ou só manter o histórico, decidir na fase de desenho).
2. **Backend:**
   - Criar/aprovar lançamento com entidade dona ≠ entidade da conta pagadora → cria o acerto automaticamente (mesma transação de banco).
   - Rotas: listar acertos abertos por par de entidades; marcar como acertado vinculando uma transferência
     (`CreateTransfer`) ou registrando abatimento; desfazer.
   - Saldos: o caixa de cada entidade reflete de onde o dinheiro saiu; o resultado (DRE/limite MEI/insights) reflete de
     quem é o gasto. Limite MEI e DAS usam só o que é da PJ.
   - Insight de "mistura PF/PJ" passa a ler os acertos em vez de `viaPersonalAccount`.
   - Dinheiro em `Money` (centavos); somatórios por par de entidades sem float.
3. **Frontend:** no lançamento e na Caixa de Revisão, além de "de quem é", mostrar "pago com" (padrão: a conta de onde
   veio). Quando forem diferentes, aviso "vai gerar um acerto". Tela de acertos: "<entidade> deve R$ X a <entidade>", com
   "Marcar como acertado".

## Testes que devem falhar antes

- Integração: despesa da PJ paga com conta da PF → lançamento na PJ, saída de caixa na PF, acerto aberto PJ → PF com o valor exato.
- Integração: marcar acerto com transferência PF ← PJ → status `acertado`, saldos corretos nas duas.
- Integração: limite MEI conta a despesa/receita da PJ, não a da conta pagadora.
- Integração: workspace B não vê acertos do A (404).
- Propriedade: soma dos acertos abertos entre duas entidades = soma dos lançamentos cruzados não acertados.

## Critério de pronto

- [ ] Testes acima falharam antes e passam depois; Gate 0 verde; mutação ≥ 80% no módulo novo.
- [ ] Os cenários funcionam de ponta a ponta no ambiente local em mais de uma direção: PF de um pagando pela empresa
      do outro, empresa pagando despesa pessoal, e empresa de um pagando pela empresa do outro.
- [ ] Tabela do `README.md` desta pasta atualizada.

## Como foi resolvido (2026-11-21) — v1

- **DB** (migration `20261121220000_settlements_paid_by_entity`): `transactions.paid_by_entity_id` (FK `entities`,
  `SET NULL`) e tabela `settlements` (um acerto por lançamento: devedora, credora, valor `Decimal(14,2)`, status
  `aberto | acertado | cancelado`, forma `transferencia | abatimento`, quem e quando acertou).
  Escolhi **entidade pagadora** em vez de "conta pagadora": novos usuários nem têm `FinancialAccount`, e o acerto é
  entre entidades. A conta continua ligada pelo Open Finance (`BankAccount.entityId`).
- **Regra pura** `ledger/domain/SettlementRule.ts`: despesa de A paga por B → A deve a B; receita de A que caiu em B →
  B deve a A; sem pagador, mesmo pagador, transferência ou zero → nada. Testada com propriedades (fast-check).
- **`syncTransactionSettlement`** roda depois de criar, editar, restaurar ou apagar lançamento nos dois caminhos
  (`services/transactionService.ts` dentro da mesma transação de banco; `ledger` create/update/delete logo após gravar,
  idempotente). Editar reabre acerto já feito se os termos mudarem; apagar remove o aberto e marca o feito como `cancelado`.
- **Compatibilidade:** `viaPersonalAccount = true` em lançamento de negócio sem pagador explícito vira pagador = PF.
  Lançamentos antigos com `viaPersonalAccount` **não** foram migrados para acertos (histórico mantido como estava).
- **Open Finance:** a aprovação usa a entidade da conta de origem como pagadora; aprovar em outra entidade gera o acerto.
  `GET /api/imports` passa a devolver `accountEntityId`.
- **Rotas:** `GET /api/settlements?status=` (itens + saldo líquido por par), `POST /api/settlements/:id/settle { via }`,
  `POST /api/settlements/:id/reopen`. Pagador de outro workspace → 404.
- **Frontend:** "Pago com o dinheiro de" / "Recebido na conta de" no modal de lançamento (substitui a caixinha
  "Passou pela conta pessoal"), "Gasto de / Receita de" por item na Caixa de Revisão com aviso de acerto, e tela
  **Acertos** (`/acertos`, no menu quando há mais de uma entidade) com saldo por par, "Transferi", "Abater" e "Desfazer".

### Pendente (próxima etapa)

- **Saldo de caixa por entidade** refletindo de onde o dinheiro saiu (hoje relatórios e painel continuam pela entidade dona).
- **Marcar como acertado não cria a transferência** no ledger (as transferências são entre `FinancialAccount`, que
  usuários novos não têm). Hoje o acerto só registra a forma.
- Insight de "mistura PF/PJ" ainda lê `viaPersonalAccount`, não os acertos.
