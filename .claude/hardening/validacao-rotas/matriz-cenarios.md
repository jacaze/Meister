# Matriz de Cenários — Validação de Entrada nas Rotas de Escrita (Etapa 3)

Esta matriz consolida as verificações de entrada (Zero Trust) e invariantes de domínio aplicadas às **41 rotas reais de escrita (`POST`, `PUT`, `PATCH`, `DELETE`)** da API do MEIster, agrupadas conforme o plano da Etapa 3.

---

## 1. Formato Global de Erro de Validação (`src/shared/http-error-handler.ts`)

| Cenário / Condição | Entrada | Resultado Esperado | Cobertura de Teste |
|---|---|---|---|
| `ZodError` lançado por `.parse()` | Qualquer payload que viole schema Zod | HTTP `400`, `code: 'VALIDATION_ERROR'`, mensagem em português (`z.config(z.locales.pt())`), `details.errors: [{ path, code }]` sem ecoar valores enviados | `http-error-handler.test.ts` |
| `ZodError` com issues vazias | `new z.ZodError([])` | HTTP `400`, `message: 'Dados inválidos.'`, `details.errors: []` | `http-error-handler.test.ts` |
| `x-correlation-id` válido vs inválido | Header ausente, vazio (`"   "`), com espaços (`" id "`) ou > 128 chars | Aceita e aplica `.trim()` até 128 chars; gera UUID v4 caso ausente, vazio ou > 128 chars | `http-error-handler.test.ts` |
| Corpos estruturalmente malformados | `null`, `[]`, `text/plain`, string de 1 MB, objeto aninhado (50 níveis), `__proto__`/`constructor` | Em rotas com body: HTTP `400 VALIDATION_ERROR` (ou `415` para `text/plain`). Em rotas `noBody`: ignora body e executa ação com resposta esperada (2xx/4xx), nunca 5xx | `probes/fuzz-rotas.ts`, suítes `*-validation.integration.test.ts` |

---

## 2. Grupo 1: Dinheiro (`ledger`, `openfinance`, `receipts`)

| Rota | Schema / Camada | Cenários Inválidos (HTTP 400) | Contratos Válidos Preservados (HTTP 2xx) |
|---|---|---|---|
| `POST /api/transactions` | `httpCreateTransactionSchema` (`ledger-schemas.ts`) | `null`, `[]`, `description` vazia/só espaços ou > 1000 chars, `type` fora de `['receita','despesa']`, `amount` não numérico/`NaN`/≤ 0/vírgula inválida, `categoryId` vazio, `transactionDate` inválida, `sourceRef` > 255 chars | Aceita `amount` como `number` (`150.5`) ou `string` (`"150.50"`), `description` até 1000 chars, `paymentMethod` opcional/nullable/vazio (`""`) |
| `PUT /api/transactions/:id` | `httpUpdateTransactionSchema` (`ledger-schemas.ts`) | `null`, `[]`, `description` vazia ou > 1000 chars, `type` inválido, `amount` ≤ 0 ou `NaN`, `transactionDate` inválida | Atualização parcial preservada; descrições até 1000 chars |
| `DELETE /api/transactions/:id` | Rota `noBody` (`transactionRoutes.ts`) | `:id` inexistente ou de outro workspace → `404` | Exclui (soft delete) lançamento pertencente ao workspace |
| `POST /api/transactions/:id/restore` | Rota `noBody` (`transactionRoutes.ts`) | `:id` inexistente ou de outro workspace → `404` | Restaura lançamento excluído atomicamente |
| `POST /api/ledger/transactions` | `createTransactionSchema` (`ledger-schemas.ts`) | `null`, `[]`, `description` vazia ou > 1000 chars, `type` fora do enum, `amount` inválido, `splits` com `categoryId` não-UUID | Cria lançamento com ou sem splits, `amount` string ou number, `description` até 1000 chars |
| `PATCH /api/ledger/transactions/:id` | `updateTransactionSchema` (`ledger-schemas.ts`) | `null`, `[]`, `description` vazia ou > 1000 chars, `notes` > 2000 chars, `splits` inválidos | Atualiza campos parciais do lançamento |
| `DELETE /api/ledger/transactions/:id` | Rota `noBody` (`ledgerRoutes.ts`) | `:id` inexistente ou de outro workspace → `404` | Soft delete do lançamento |
| `POST /api/ledger/transfers` | `createTransferSchema` (`ledger-schemas.ts`) | `fromAccountId`/`toAccountId` não-UUID ou iguais, `amount` ≤ 0, `occurredOn` vazia/inválida, `description` > 1000 chars | Cria transferência atômica entre contas do workspace |
| `POST /api/ledger/owner-withdrawal` | `registerOwnerWithdrawalSchema` (`ledger-schemas.ts`) | `amount` ≤ 0 ou não numérico, `occurredOn` vazia/inválida, `description` > 1000 chars | Registra retirada de sócio (pró-labore/distribuição) |
| `POST /api/openfinance/connect-item` | `connectPluggyItemSchema` (`openfinance-schemas.ts`) | `itemId` ausente, não-string, vazio ou > 255 chars; `entityId` não-UUID | Vincula item Pluggy ao workspace |
| `DELETE /api/openfinance/connections/:id` | Rota `noBody` (`openFinanceRoutes.ts`) | `:id` de outro workspace → `404` | Desconecta conta Open Finance |
| `POST /api/imports/statement` | `importStatementSchema` (`openfinance-schemas.ts`) | `content` ausente, vazio ou > 10 MB; `provider` fora de `['ofx','csv','pluggy']`; `institution` > 255 chars; `entityId` não-UUID | Importa extrato OFX/CSV com memos longos |
| `POST /api/imports/approve` | `approveImportedTransactionSchema` (`openfinance-schemas.ts`) | `bankTransactionId` não-UUID; `categoryId`/`entityId` não-UUID | Aprova transação importada (inclusive com memo > 300 chars truncado em 1000 chars) |
| `POST /api/imports/batch-approve` | `batchApproveImportedTransactionsSchema` (`openfinance-schemas.ts`) | `items` não-array ou > 500 itens; item com `bankTransactionId` não-UUID | Aprova lote de transações importadas |
| `POST /api/imports/ignore` | `ignoreImportedTransactionSchema` (`openfinance-schemas.ts`) | `bankTransactionId` ausente ou não-UUID | Ignora transação importada |
| `POST /api/receipts/parse` | `parseReceiptPhotoSchema` (`receipt-schemas.ts`) | Objeto vazio `{}` (sem `imageBase64` nem `textOrQrUrl`), `imageBase64` < 20 chars, `mimeType` não `image/*`, `textOrQrUrl` < 10 ou > 2048 chars | Extrai dados de nota fiscal via foto ou QR/URL |
| `POST /api/receipts/confirm` | `confirmReceiptSchema` (`receipt-schemas.ts`) | `total` ausente/inválido, `description` > 1000 chars, `accessKey` > 100 chars, `issuerCnpj` > 20 chars, `splits` inválidos | Confirma recibo e gera lançamento no ledger |

---

## 3. Grupo 2: IA e Mensageria (`assistant`, `telegram`)

| Rota | Schema / Camada | Cenários Inválidos (HTTP 400) | Contratos Válidos Preservados (HTTP 2xx) |
|---|---|---|---|
| `POST /api/assistant/chat` | `chatAssistantSchema` (`assistant-schemas.ts`) | `message` ausente, vazia ou > 10000 chars; `history` com `role` fora de `['user','assistant']` ou `content` > 10000 chars | Responde ao chat financeiro mantendo histórico |
| `POST /api/assistant/proposals` | `proposeFromTextSchema` (`assistant-schemas.ts`) | `text` ausente, vazio ou > 10000 chars; `entityId` não-UUID | Gera proposta de lançamento a partir de texto livre |
| `POST /api/assistant/proposals/:id/confirm` | `assistantProposalParamSchema` + `noBody` | `:id` não-UUID → `400 VALIDATION_ERROR`; proposta inexistente/outro workspace → `404` | Confirma proposta pendente e cria transação |
| `POST /api/assistant/proposals/:id/cancel` | `assistantProposalParamSchema` + `noBody` | `:id` não-UUID → `400 VALIDATION_ERROR`; proposta inexistente/outro workspace → `404` | Cancela proposta pendente |
| `POST /api/assistant/receipt` | `parseReceiptPhotoSchema` (`receipt-schemas.ts`) | `{}` vazio, `imageBase64` curto, `mimeType` inválido | Analisa foto/QR de nota pelo assistente e cria proposta |
| `POST /api/telegram/link-token` | Rota `noBody` (`telegramRoutes.ts`) | Requer apenas autenticação JWT | Gera código temporário de vinculação do Telegram |
| `POST /api/telegram/unlink` | Rota `noBody` (`telegramRoutes.ts`) | Requer apenas autenticação JWT | Remove vínculo do Telegram do usuário |
| `POST /api/telegram/webhook` | `telegramWebhookUpdateSchema` (`telegram-schemas.ts`) | `update_id` ausente ou não numérico; `message.chat.id` ausente; `text` ou `caption` > 10000 chars; segredo inválido → `401` | Processa updates válidos do bot do Telegram |

---

## 4. Grupo 3: Cadastros, Potes, Fiscal, Insights, Educação e Compliance

| Rota | Schema / Camada | Cenários Inválidos (HTTP 400) | Contratos Válidos Preservados (HTTP 2xx) |
|---|---|---|---|
| `POST /api/register` | `registerUserSchema` (`auth-user-schemas.ts`) | `name` vazio ou > 120 chars, `email` inválido ou > 254 chars, `password` vazia ou > 255 chars, `accountType` fora de `['mei','pessoa_fisica']` | Registra usuário com trim/lowercase no e-mail |
| `POST /api/login` | `loginUserSchema` (`auth-user-schemas.ts`) | `email` vazio ou > 254 chars, `password` vazia ou > 255 chars | Autentica usuário e retorna token JWT |
| `PATCH /api/me` | `updateProfileSchema` (`auth-user-schemas.ts`) | `{}` sem `name` nem `accountType`, `name` só espaços ou > 120 chars, `accountType` inválido | Atualiza nome e/ou tipo de conta |
| `POST /api/categories` | `createCategorySchema` (`category-schemas.ts`) | `name` vazio ou > 60 chars, `type` fora de `['receita','despesa']`, `color` > 20 chars, `icon` > 50 chars | Cria categoria customizada no workspace |
| `PUT /api/categories/:id` | `updateCategorySchema` (`category-schemas.ts`) | `null`, `[]`, `name` vazio ou > 60 chars, `type` inválido, `color` > 20 chars, `icon` > 50 chars | Atualiza categoria customizada |
| `DELETE /api/categories/:id` | Rota `noBody` (`categoryRoutes.ts`) | `:id` inexistente/padrão → `400`/`404` | Remove categoria customizada sem uso |
| `PUT /api/workspace/business-profile` | `updateBusinessProfileSchema` (`workspace-schemas.ts`) | `null`, `[]`, `state` > 2 chars, `legalName`/`tradeName` > 255 chars, `taxId`/`cnae` > 20 chars, `city`/`meiCategory` > 100 chars | Cria ou atualiza perfil MEI do workspace |
| `POST /api/das/:id/pay` | `markDasPaidSchema` (`fiscal-schemas.ts`) | `paidOn` ausente, vazio ou data inválida; `paidAmount` negativo ou não numérico | Marca guia DAS como paga e gera lançamento fiscal |
| `POST /api/jars/plan` | `createJarPlanSchema` (`jars-schemas.ts`) | `{}` sem `templateSlug` nem `customJars`, `baseMode` fora de `['mes_atual','mes_anterior','media_3_meses']`, `templateSlug` inexistente, soma de percentuais ≠ 100%. **Garantia crítica:** nenhum erro de validação desativa o plano de potes ativo anterior | Cria novo plano de potes e migra vínculos de categorias |
| `PATCH /api/jars/plan/:planId` | `updateJarPlanBaseModeSchema` (`UpdateJarPlanBaseMode.ts`) | `baseMode` ausente ou fora do enum | Atualiza base de cálculo do plano de potes |
| `POST /api/jars/map-categories` | `mapCategoriesSchema` (`jars-schemas.ts`) | `planId` ou `jarId` vazio; `categoryIds` não-array de strings | Vincula categorias a um pote |
| `POST /api/jars/map-categories-batch` | `batchMapCategoriesSchema` (`jars-schemas.ts`) | `planId` vazio, `mappings` vazio ou com `jarId` vazio | Vincula categorias em lote e ativa plano |
| `POST /api/insights/ask` | `askFinancesSchema` (`insights-schemas.ts`) | `question` ausente, vazia/só espaços ou > 1000 chars; `entityId` não-UUID | Consulta assistente de insights financeiros |
| `POST /api/insights/:id/feedback` | `submitInsightFeedbackSchema` (`insights-schemas.ts`) | `value` fora de `['util','inutil']`, `reason` > 1000 chars | Registra feedback sobre insight |
| `POST /api/insights/run` | `runDetectorsBodySchema` (`insights-schemas.ts`) | `null`, `[]`, `entityId` não-UUID | Executa detectores de insights (`{}` ou `{ entityId }` válidos) |
| `POST /api/education/lessons/:slug/quiz` | `submitQuizBodySchema` (`education-schemas.ts`) | `answers` ausente, vazio, > 100 itens, ou com inteiros negativos/floats | Corrige quiz de lição educacional |
| `POST /api/education/ask` | `askQuestionBodySchema` (`education-schemas.ts`) | `question` vazia/só espaços ou > 500 chars; `contextId` não-UUID | Responde dúvida educacional |
| `POST /api/education/nudges/:id/feedback` | `nudgeFeedbackBodySchema` (`education-schemas.ts`) | `feedback` fora de `['util','inutil']`; `:id` inexistente → `404 NotFoundError` (nunca 500 Prisma P2025) | Registra feedback em nudge educacional |
| `POST /api/consents` | `recordConsentSchema` (`compliance-schemas.ts`) | `kind` fora de `['terms','privacy','ai_processing','open_finance']`, `accepted` não-booleano, `version` > 50 chars | Registra consentimento LGPD |
| `DELETE /api/me` | `eraseAccountSchema` (`compliance-schemas.ts`) | `password` ausente, vazia ou > 255 chars; senha incorreta → `401` | Apaga conta e dados do titular (LGPD) |
