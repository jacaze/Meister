# 17 — Perfil no primeiro acesso: o app pergunta o caso e se autoconfigura

**Prioridade:** 🟡 (base para a família; muda o cadastro de todos)
**Donos:** DB → QA → Backend → Frontend
**Branch sugerida:** `feat/onboarding-perfil`

## Problema

Hoje o cadastro só pergunta **MEI ou pessoa física** (`frontend/src/pages/AuthPage.tsx:20`,
`backend/src/modules/workspace/application/use-cases/ProvisionWorkspace.ts:6,22`) e cria uma PF e, se MEI, uma PJ.
Não atende autônomo sem CNPJ nem casal/família, e não dá para mudar de caso depois.

## Decisões do dono (2026-11-21)

O app oferece **quatro situações** no primeiro acesso e cria as entidades certas; dá para mudar depois:

| Situação | O que o app cria |
|---|---|
| **Pessoa sozinha** | 1 PF |
| **MEI/autônomo sozinho** | 1 PF + o negócio: **PJ** (MEI ou outra) **ou atividade autônoma** |
| **Casal ou família sem negócio** | PF de quem cadastra + convite para o cônjuge (tarefa 15) + a casa compartilhada |
| **Casal com negócio(s)** | Igual ao anterior + o negócio de cada um (ex.: ela com uma clínica PJ, ele autônomo; qualquer combinação de PJ e autônomo, para qualquer um dos dois) |

**Autônomo sem CNPJ = atividade separada:** entidade própria ligada à PF da pessoa, com receitas e despesas do trabalho
separadas do pessoal (útil para carnê-leão/IR), **sem** regras de MEI (sem limite anual, sem DAS).

## O que fazer

1. **DB:** `Entity.kind` ganha `autonomo` (além de `pf | pj`); `Entity.ownerUserId` (quem é a pessoa dona — o mesmo
   campo da tarefa 15, criar aqui se esta vier antes); `Workspace.profile` = `individual | negocio | familia | familia_negocio`.
   Migration expandir → migrar → contrair: workspaces atuais viram `individual` (sem PJ) ou `negocio` (com PJ).
2. **Backend:** cadastro recebe o perfil e a lista de negócios (`{ tipo: 'mei' | 'pj' | 'autonomo', nome }`) e cria as
   entidades. Rotas para adicionar/remover negócio e trocar de perfil depois (remover entidade com lançamentos → 409, arquivar).
   Módulo fiscal (limite MEI, DAS) só para entidades `pj` com `isMei`; `autonomo` fica fora.
3. **Frontend:** passo de onboarding após o cadastro (não no formulário de login): "Qual é o seu caso?" com as quatro
   opções, depois "Quais negócios?" quando couber. O seletor PF/PJ do topo vira seletor de entidades (pessoa e negócios).
4. Atualizar `docs/api/**` e o README.

## Testes que devem falhar antes

- Integração: cadastro "MEI/autônomo sozinho" com negócio `autonomo` → PF + entidade `autonomo`, sem DAS gerado.
- Integração: "casal com negócio" com uma empresa `pj` de qualquer ramo → PF + PJ do dono do cadastro; convite pendente para o cônjuge (se a 15 existir).
- Integração: trocar `individual` → `negocio` adiciona a PJ sem perder lançamentos.
- Migração: workspace antigo com PJ vira `negocio`; sem PJ vira `individual`.

## Critério de pronto

- [ ] As quatro situações criam as entidades da tabela; dá para mudar depois.
- [ ] Autônomo não entra em limite MEI nem DAS.
- [ ] Tabela do `README.md` desta pasta atualizada.
