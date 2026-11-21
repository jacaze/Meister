# 18 — De quem é o gasto × com o que foi pago, e acertos

**Prioridade:** 🟡 (vale para o MEI sozinho; é a peça central da família com negócio)
**Donos:** DB → QA → Backend → Frontend
**Branch sugerida:** `feat/acertos-entre-entidades`

## Problema

O lançamento tem uma entidade só (`Transaction.entityId`). Quando a despesa é de uma entidade mas foi paga com a conta
de outra, o app só guarda um sim/não, `viaPersonalAccount` (`backend/prisma/schema.prisma:254`), usado num insight de
"mistura PF/PJ" (`insights/infra/PrismaFinancialSnapshotReader.ts:147`). Não sabe **de quem** era o cartão nem que surgiu
uma dívida entre as entidades.

Exemplo do dono: a esposa compra material da **clínica (PJ dela)** com o **cartão pessoal do marido (PF dele)**.
O gasto é da clínica; o dinheiro saiu do marido; a clínica fica devendo ao marido.

## Decisões do dono (2026-11-21)

- **Registra e cobra o acerto:** a despesa entra na entidade dona do gasto, o pagamento sai da conta que pagou, e o app
  mostra "clínica deve R$ X ao marido" até alguém marcar como acertado (transferência ou abatimento).
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
   veio). Quando forem diferentes, aviso "vai gerar um acerto". Tela de acertos: "Clínica deve R$ X a Fulano", com
   "Marcar como acertado".

## Testes que devem falhar antes

- Integração: despesa da PJ paga com conta da PF → lançamento na PJ, saída de caixa na PF, acerto aberto PJ → PF com o valor exato.
- Integração: marcar acerto com transferência PF ← PJ → status `acertado`, saldos corretos nas duas.
- Integração: limite MEI conta a despesa/receita da PJ, não a da conta pagadora.
- Integração: workspace B não vê acertos do A (404).
- Propriedade: soma dos acertos abertos entre duas entidades = soma dos lançamentos cruzados não acertados.

## Critério de pronto

- [ ] Testes acima falharam antes e passam depois; Gate 0 verde; mutação ≥ 80% no módulo novo.
- [ ] O exemplo da clínica funciona de ponta a ponta no ambiente local.
- [ ] Tabela do `README.md` desta pasta atualizada.
