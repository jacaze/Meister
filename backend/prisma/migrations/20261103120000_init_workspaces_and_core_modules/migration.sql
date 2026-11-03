-- AlterEnum
BEGIN;
CREATE TYPE "TransactionOrigin_new" AS ENUM ('manual', 'telegram', 'open_finance', 'importacao');
ALTER TABLE "public"."transactions" ALTER COLUMN "origin" DROP DEFAULT;
ALTER TABLE "transactions" ALTER COLUMN "origin" TYPE "TransactionOrigin_new" USING ("origin"::text::"TransactionOrigin_new");
ALTER TYPE "TransactionOrigin" RENAME TO "TransactionOrigin_old";
ALTER TYPE "TransactionOrigin_new" RENAME TO "TransactionOrigin";
DROP TYPE "public"."TransactionOrigin_old";
ALTER TABLE "transactions" ALTER COLUMN "origin" SET DEFAULT 'manual';
COMMIT;

-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_user_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_user_id_fkey";

-- DropIndex
DROP INDEX "categories_user_id_type_idx";

-- DropIndex
DROP INDEX "transactions_user_id_transaction_date_idx";

-- DropIndex
DROP INDEX "transactions_user_id_type_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "workspace_id" TEXT NOT NULL,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "ai_confidence" DECIMAL(5,4),
ADD COLUMN     "counterparty" TEXT,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "entity_id" TEXT NOT NULL,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "external_provider" TEXT,
ADD COLUMN     "financial_account_id" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source_ref" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'confirmado',
ADD COLUMN     "transfer_group_id" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "via_personal_account" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workspace_id" TEXT NOT NULL,
ALTER COLUMN "user_id" DROP NOT NULL,
ALTER COLUMN "category_id" DROP NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ativo',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "legal_name" TEXT,
    "opened_on" DATE,
    "activity" TEXT,
    "is_mei" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "external_id" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorization_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT,
    "pattern" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_splits" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_audit" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_parameters" (
    "year" INTEGER NOT NULL,
    "mei_annual_limit" DECIMAL(14,2) NOT NULL,
    "mei_monthly_reference" DECIMAL(14,2) NOT NULL,
    "tolerance_pct" DECIMAL(5,4) NOT NULL,
    "minimum_wage" DECIMAL(14,2) NOT NULL,
    "icms_amount" DECIMAL(14,2) NOT NULL,
    "iss_amount" DECIMAL(14,2) NOT NULL,
    "inss_pct" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "fiscal_parameters_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "das_charges" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "paid_on" DATE,
    "paid_amount" DECIMAL(14,2),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "das_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limit_alerts" (
    "id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "band" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limit_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jar_plans" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "base_mode" TEXT NOT NULL DEFAULT 'mes_atual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jar_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jars" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(5,2),
    "fixed_amount" DECIMAL(14,2),
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "goal_amount" DECIMAL(14,2),
    "goal_date" DATE,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "jars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jar_categories" (
    "plan_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "jar_id" TEXT NOT NULL,

    CONSTRAINT "jar_categories_pkey" PRIMARY KEY ("plan_id","category_id")
);

-- CreateTable
CREATE TABLE "jar_period_snapshots" (
    "plan_id" TEXT NOT NULL,
    "jar_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "allocated" DECIMAL(14,2) NOT NULL,
    "used" DECIMAL(14,2) NOT NULL,
    "carried_over" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jar_period_snapshots_pkey" PRIMARY KEY ("jar_id","period")
);

-- CreateTable
CREATE TABLE "jar_alerts" (
    "id" TEXT NOT NULL,
    "jar_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jar_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_receipts" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "access_key" CHAR(44) NOT NULL,
    "issuer_cnpj" TEXT,
    "issued_on" DATE,
    "total" DECIMAL(14,2),
    "source" TEXT NOT NULL DEFAULT 'ia',
    "items" JSONB,
    "discount" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "telegram_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_updates" (
    "id" TEXT NOT NULL,
    "update_id" BIGINT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recebida',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "inbound_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "ambiguous" JSONB,
    "pending_question" JSONB,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "source" TEXT NOT NULL DEFAULT 'texto',
    "source_ref" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "confirmed_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "proposal_id" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "error_code" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_family_id_idx" ON "sessions"("user_id", "family_id");

-- CreateIndex
CREATE INDEX "email_tokens_user_id_kind_idx" ON "email_tokens"("user_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "entities_cnpj_key" ON "entities"("cnpj");

-- CreateIndex
CREATE INDEX "entities_workspace_id_active_idx" ON "entities"("workspace_id", "active");

-- CreateIndex
CREATE INDEX "financial_accounts_workspace_id_entity_id_idx" ON "financial_accounts"("workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_workspace_id_external_id_key" ON "financial_accounts"("workspace_id", "external_id");

-- CreateIndex
CREATE INDEX "categorization_rules_workspace_id_pattern_idx" ON "categorization_rules"("workspace_id", "pattern");

-- CreateIndex
CREATE INDEX "transaction_splits_transaction_id_idx" ON "transaction_splits"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_audit_workspace_id_transaction_id_idx" ON "transaction_audit"("workspace_id", "transaction_id");

-- CreateIndex
CREATE INDEX "das_charges_workspace_id_status_idx" ON "das_charges"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "das_charges_entity_id_competence_key" ON "das_charges"("entity_id", "competence");

-- CreateIndex
CREATE UNIQUE INDEX "limit_alerts_entity_id_year_band_key" ON "limit_alerts"("entity_id", "year", "band");

-- CreateIndex
CREATE INDEX "jar_plans_workspace_id_entity_id_active_idx" ON "jar_plans"("workspace_id", "entity_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "jars_plan_id_slug_key" ON "jars"("plan_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "jar_alerts_jar_id_period_band_key" ON "jar_alerts"("jar_id", "period", "band");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_receipts_workspace_id_access_key_key" ON "fiscal_receipts"("workspace_id", "access_key");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_links_chat_id_key" ON "telegram_links"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_tokens_token_hash_key" ON "telegram_link_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_updates_update_id_key" ON "inbound_updates"("update_id");

-- CreateIndex
CREATE INDEX "inbound_updates_chat_id_status_idx" ON "inbound_updates"("chat_id", "status");

-- CreateIndex
CREATE INDEX "proposals_workspace_id_user_id_status_idx" ON "proposals"("workspace_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "ai_runs_input_hash_idx" ON "ai_runs"("input_hash");

-- CreateIndex
CREATE INDEX "categories_workspace_id_type_idx" ON "categories"("workspace_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "categories_workspace_id_type_slug_key" ON "categories"("workspace_id", "type", "slug");

-- CreateIndex
CREATE INDEX "transactions_workspace_id_transaction_date_idx" ON "transactions"("workspace_id", "transaction_date");

-- CreateIndex
CREATE INDEX "transactions_workspace_id_entity_id_type_transaction_date_idx" ON "transactions"("workspace_id", "entity_id", "type", "transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_external_provider_external_id_key" ON "transactions"("external_provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_workspace_id_source_ref_key" ON "transactions"("workspace_id", "source_ref");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audit" ADD CONSTRAINT "transaction_audit_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_audit" ADD CONSTRAINT "transaction_audit_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "das_charges" ADD CONSTRAINT "das_charges_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "das_charges" ADD CONSTRAINT "das_charges_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limit_alerts" ADD CONSTRAINT "limit_alerts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_plans" ADD CONSTRAINT "jar_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_plans" ADD CONSTRAINT "jar_plans_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jars" ADD CONSTRAINT "jars_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "jar_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_categories" ADD CONSTRAINT "jar_categories_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "jar_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_categories" ADD CONSTRAINT "jar_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_categories" ADD CONSTRAINT "jar_categories_jar_id_fkey" FOREIGN KEY ("jar_id") REFERENCES "jars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_period_snapshots" ADD CONSTRAINT "jar_period_snapshots_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "jar_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_period_snapshots" ADD CONSTRAINT "jar_period_snapshots_jar_id_fkey" FOREIGN KEY ("jar_id") REFERENCES "jars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jar_alerts" ADD CONSTRAINT "jar_alerts_jar_id_fkey" FOREIGN KEY ("jar_id") REFERENCES "jars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

