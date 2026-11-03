## Resumo
<!-- Descreva o que foi alterado e o motivo -->

## Requisitos e Tarefas Relacionadas
- **Tarefa(s):** <!-- ex.: T0.2 -->
- **Requisito(s):** <!-- ex.: RF-AUT-01, RNF-02 -->

## Checklist de Qualidade (Definition of Done)
- [ ] Testes escritos antes e vistos falhando (TDD)
- [ ] `typecheck` · `lint` · `test` · `build` verdes
- [ ] Autorização: teste de acesso cruzado (`WorkspaceScope`) para toda rota nova/alterada
- [ ] Dinheiro e data: `Money` (sem `float`) e `LocalDate`/`Clock` no fuso `America/Sao_Paulo` (sem UTC implícito)
- [ ] Contrato alterado? (OpenAPI / eventos / schema Prisma) -> impactos listados abaixo
- [ ] Migration com plano de rollback testado (se aplicável)
- [ ] Documentação e `.env.example` atualizados
- [ ] Zero segredos ou PII em código, logs ou fixtures
- [ ] Gate A (`module-hardening`) / Gate B (`adversarial-architecture-qa`) executado quando aplicável

## Evidências Executadas
```text
<!-- Cole aqui a saída resumida dos comandos de typecheck, lint, test e mutação -->
```
