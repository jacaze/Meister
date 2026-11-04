# MEIster — Regras Mandatórias de Desenvolvimento e Engenharia

Este documento define as diretrizes inegociáveis de engenharia de software, qualidade de código e ritmo de trabalho para qualquer assistente de IA ou desenvolvedor atuando neste repositório.

---

## 📋 REGRA DE OURO #0: SEMPRE DAR UM PARECER ANTES DE EXECUTAR (ZERO AÇÃO ÀS CEGAS)

1. **PARECER PRÉVIO OBRIGATÓRIO:**
   - Antes de executar qualquer ação, alteração de código, migração de banco, início de comando ou configuração de ferramenta externa, a IA deve **obrigatoriamente apresentar um parecer prévio** (diagnóstico, impactos, arquivos que serão tocados, estratégia e riscos).
2. **ALINHAMENTO COM O USUÁRIO:**
   - Se a ação envolver decisões de arquitetura, ferramentas externas (túneis, webhooks, serviços de terceiros), custos de API ou mudança de escopo, a IA deve detalhar as opções, apresentar sua recomendação técnica e obter o aval do usuário antes de rodar.
3. **TRANSPARÊNCIA TOTAL DE PROCESSAMENTO:**
   - O usuário deve sempre saber com precisão o que está sendo processado localmente e o que é enviado para provedores externos (como Google Gemini API, Pluggy ou Telegram), evitando premissas ocultas ou consumo desnecessário de cotas.

---

## 🛑 REGRA DE OURO #1: UMA COISA POR VEZ, BEM FEITA (ANTI-BATCHING)

1. **PROIBIDO DESENVOLVER MÚLTIPLOS MÓDULOS EM LOTE:**
   - Mesmo que uma lista de módulos esteja planejada ou que o usuário diga "pode prosseguir", **NUNCA** implemente mais de um módulo ou feature de uma só vez.
   - O trabalho deve ser estritamente fatiado: **um único módulo/feature por ciclo**, levado até o estado de arte antes de tocar no próximo.

2. **FLUXO OBRIGATÓRIO POR MÓDULO:**
   - **Etapa 1:** Definir o escopo do **único** módulo a ser trabalhado.
   - **Etapa 2:** Implementar seguindo Clean Architecture estrita (`domain` → `application` → `infra` → `interfaces`).
   - **Etapa 3:** Aplicar a skill **`module-hardening`** (revisão arquivo por arquivo, linha a linha).
   - **Etapa 4:** Aplicar a skill **`software-craftsmanship-guardian`** (engenharia defensiva, testes de borda e concorrência).
   - **Etapa 5:** Executar build, testes unitários e testes de integração com banco real.
   - **Etapa 6:** Apresentar a entrega ao usuário, solicitar validação e **AGUARDAR aprovação explícita** antes de iniciar qualquer outro módulo.

---

## 🔍 REGRA DE OURO #2: REVISÃO LINHA A LINHA (`module-hardening`)

1. **Leitura 100% Coberta:**
   - É terminantemente proibido fazer revisão por amostragem, resumo ou suposição ("entendi a ideia geral").
   - Cada arquivo do módulo deve ser lido e verificado linha a linha, na ordem: domínio → casos de uso → adaptadores de infraestrutura → rotas/UI.
2. **Eliminação de Código Ruim e Fragilidades:**
   - Verifique explicitamente:
     - Null/undefined checks e tipos estritos.
     - Validação de entrada na borda (Zero Trust).
     - Tratamento correto de exceções sem engolir erros.
     - Nenhuma premissa oculta ou dependência frágil.
3. **Sem Teste que Falha, Não Há Prova:**
   - Todo bug corrigido deve ter um teste que falharia sem a correção.
   - Testes unitários com fakes só para domínio puro. Concorrência, banco e transações financeiras devem ser testados contra PostgreSQL real em testes de integração.

---

## 🛡️ REGRA DE OURO #3: ENGENHARIA DEFENSIVA & ARTESANATO DE SOFTWARE (`software-craftsmanship-guardian`)

1. **Zero Trust de Input:**
   - Toda entrada externa (body, query, params, imagens, webhooks) deve ser validada por schema antes de tocar a lógica de negócio.
   - O cliente nunca define valores protegidos (preços finais, percentuais de imposto, roles de acesso ou flags de auditoria).
2. **Concorrência e Idempotência:**
   - Toda movimentação financeira de saldo, potes, guias DAS ou transações deve ser atômica e protegida contra race conditions (*double-spending* ou duplicações).
3. **Resiliência e Falhas Parciais:**
   - Nenhuma chamada externa (SEFAZ, APIs de IA, brokers) pode ter timeout infinito.
   - Sempre implemente fallbacks elegantes (ex: fallback heurístico local quando a API do Gemini estiver indisponível ou sofrer picos de tráfego).
4. **Segurança de Credenciais:**
   - Nunca expor chaves de API, tokens JWT ou senhas em logs, commits, artefatos ou respostas de erro.
   - `backend/.env` deve permanecer sempre estritamente ignorado pelo `.gitignore`.

---

## 🌿 REGRA DE OURO #4: DISCIPLINA GIT & BRANCHES

1. **Branch por Feature:**
   - Todo módulo ou ajuste é feito em branch dedicada (`feat/<nome-modulo>` ou `fix/<nome-ajuste>`).
2. **Merge Controlado:**
   - O merge na branch `develop` só ocorre com build 100% limpo, linter sem erros e suíte de testes (unitários + integração) aprovada.
   - Branch `main` é estritamente reservada para releases estáveis de produção.
3. **Arquivos Proibidos de Versionamento:**
   - Diretórios de planejamento como `guia-planejamento-ia/`, `*planejamento*/` e `stitch_fluxo_de_faturas_e_potes/` nunca devem ser comitados.
