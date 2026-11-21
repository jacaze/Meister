# 04 — Promover `develop` → `main` (release)

**Prioridade:** 🔴 bloqueador de produção
**Dono:** Humano (agentes não commitam em `main`)

## Situação em 2026-11-21

- `main` ainda é a **versão antiga em JavaScript** (último commit: `9202801 docs(readme): atualiza
  documentação com tela do DAS...`). Está **169 commits atrás** do `origin/develop`.
- A branch `fix/validacao-de-entrada-nas-rotas` já foi mesclada no `develop` (PR #4, `46e2043`).
  O `develop` **local** da máquina do dono estava desatualizado: rode `git pull` nele.
- Havia alterações locais **não commitadas** na cópia de trabalho do dono:
  - `.gitignore`: adiciona `documentos/`.
  - `frontend/vite.config.ts`: porta e alvo do proxy por variável (`PORT`, `VITE_BACKEND_URL`).
- O que for publicado em produção hoje sai do `main`, ou seja, da versão antiga.

## O que fazer

1. Decidir sobre as duas alterações locais: commitar numa branch nova saindo do `develop`
   (cada uma no seu commit, Conventional Commits) ou descartar. A do `vite.config.ts` só afeta o dev server.
2. Atualizar o `develop` local (`git switch develop && git pull`).
3. Mesclar as tarefas 01, 02 e 03 no `develop`.
4. Abrir o PR de release `develop` → `main`:
   - Título: `release: v1.0.0` (ou a versão escolhida).
   - Na descrição: migrations novas (o `migrate` do compose roda `prisma migrate deploy`) e
     variáveis novas obrigatórias.
   - **Banco de produção:** se já existe um banco com dados da versão JS, o schema mudou muito.
     Faça backup e teste as migrations numa cópia antes. Se não há dados reais, comece com banco limpo.
5. Criar a tag `v1.0.0` no `main` depois do merge.

## Critério de pronto

- [ ] `git rev-list --count main..develop` = 0 depois do release.
- [ ] Tag criada.
- [ ] Deploy feito a partir do `main` e smoke test da tarefa 03 verde no domínio real.
- [ ] Tabela do `README.md` desta pasta atualizada.
