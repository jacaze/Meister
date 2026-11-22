-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "financial_accounts" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'pessoal';

-- AlterTable
ALTER TABLE "fiscal_receipts" ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "workspace_invites" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invited_by_user_id" TEXT,
    "accepted_by_user_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invites_token_hash_key" ON "workspace_invites"("token_hash");

-- CreateIndex
CREATE INDEX "workspace_invites_workspace_id_status_idx" ON "workspace_invites"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "workspace_invites_email_idx" ON "workspace_invites"("email");

-- AddForeignKey
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receipts" ADD CONSTRAINT "fiscal_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Valores aceitos (docs/familia.md §3): o banco recusa visibilidade, status ou papel desconhecidos
ALTER TABLE "entities" ADD CONSTRAINT "entities_visibility_check" CHECK ("visibility" IN ('pessoal', 'compartilhada'));
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_visibility_check" CHECK ("visibility" IN ('pessoal', 'compartilhada'));
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_visibility_check" CHECK ("visibility" IN ('pessoal', 'compartilhada'));
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_status_check" CHECK ("status" IN ('pendente', 'aceito', 'expirado', 'cancelado'));
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_role_check" CHECK ("role" IN ('editor', 'viewer'));

-- Backfill: nota fiscal confirmada gera lançamento com source_ref = 'nfe:<chave>' no mesmo workspace
UPDATE "fiscal_receipts" f
SET "entity_id" = t."entity_id",
    "user_id" = t."user_id"
FROM "transactions" t
WHERE t."workspace_id" = f."workspace_id"
  AND t."source_ref" = 'nfe:' || f."access_key"
  AND f."entity_id" IS NULL;
