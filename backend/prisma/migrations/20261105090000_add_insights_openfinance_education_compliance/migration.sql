-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_id" TEXT,
    "detector_id" TEXT NOT NULL,
    "detector_version" TEXT NOT NULL DEFAULT '1.0',
    "period" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'alta',
    "metrics" JSONB NOT NULL,
    "actions" JSONB,
    "narration_text" TEXT NOT NULL,
    "narration_source" TEXT NOT NULL DEFAULT 'template',
    "template_id" TEXT,
    "prompt_version" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_feedbacks" (
    "id" TEXT NOT NULL,
    "insight_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insight_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insight_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "detector_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sensitivity" TEXT NOT NULL DEFAULT 'normal',
    "ai_narration" BOOLEAN NOT NULL DEFAULT false,
    "snoozed_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insight_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_connections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ofx',
    "item_id" TEXT,
    "institution" TEXT NOT NULL DEFAULT 'Extrato Bancário',
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "consent_expires_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "external_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'conta_corrente',
    "name" TEXT NOT NULL DEFAULT 'Conta Principal',
    "financial_account_id" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'ofx',
    "external_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "counterpart" TEXT,
    "raw" JSONB,
    "status" TEXT NOT NULL DEFAULT 'nova',
    "suggested_category_id" TEXT,
    "is_transfer_suspect" BOOLEAN NOT NULL DEFAULT false,
    "matched_transaction_id" TEXT,
    "imported_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "lesson_slug" TEXT NOT NULL,
    "lesson_version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'iniciada',
    "quiz_score" INTEGER,
    "quiz_attempts" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nudge_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "lesson_slug" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "dedupe_key" TEXT NOT NULL,
    "feedback" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nudge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "accepted" BOOLEAN NOT NULL DEFAULT true,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "user_id" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insights_dedupe_key_key" ON "insights"("dedupe_key");

-- CreateIndex
CREATE INDEX "insights_workspace_id_entity_id_status_idx" ON "insights"("workspace_id", "entity_id", "status");

-- CreateIndex
CREATE INDEX "insights_workspace_id_created_at_idx" ON "insights"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "insight_feedbacks_insight_id_idx" ON "insight_feedbacks"("insight_id");

-- CreateIndex
CREATE UNIQUE INDEX "insight_preferences_user_id_detector_id_key" ON "insight_preferences"("user_id", "detector_id");

-- CreateIndex
CREATE INDEX "bank_transactions_connection_id_status_idx" ON "bank_transactions"("connection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_provider_external_id_key" ON "bank_transactions"("provider", "external_id");

-- CreateIndex
CREATE INDEX "lesson_progress_workspace_id_status_idx" ON "lesson_progress"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_user_id_lesson_slug_key" ON "lesson_progress"("user_id", "lesson_slug");

-- CreateIndex
CREATE UNIQUE INDEX "nudge_logs_dedupe_key_key" ON "nudge_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "nudge_logs_user_id_sent_at_idx" ON "nudge_logs"("user_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_consents_user_id_kind_version_key" ON "user_consents"("user_id", "kind", "version");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_feedbacks" ADD CONSTRAINT "insight_feedbacks_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "insights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_feedbacks" ADD CONSTRAINT "insight_feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insight_preferences" ADD CONSTRAINT "insight_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nudge_logs" ADD CONSTRAINT "nudge_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nudge_logs" ADD CONSTRAINT "nudge_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
