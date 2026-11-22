-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "owner_user_id" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "profile" TEXT;

-- CreateIndex
CREATE INDEX "entities_owner_user_id_idx" ON "entities"("owner_user_id");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill (tarefa 17): workspaces existentes já passaram pelo cadastro antigo (MEI ou PF),
-- então ficam configurados; o perfil sai de ter ou não uma PJ.
UPDATE "workspaces" w
SET "profile" = CASE
      WHEN EXISTS (SELECT 1 FROM "entities" e WHERE e."workspace_id" = w."id" AND e."kind" = 'pj') THEN 'negocio'
      ELSE 'individual'
    END,
    "onboarding_completed_at" = CURRENT_TIMESTAMP
WHERE w."profile" IS NULL;

-- Cada entidade existente pertence ao dono do workspace.
UPDATE "entities" e
SET "owner_user_id" = (
  SELECT m."user_id" FROM "workspace_members" m
  WHERE m."workspace_id" = e."workspace_id" AND m."role" = 'owner'
  ORDER BY m."created_at" ASC
  LIMIT 1
)
WHERE e."owner_user_id" IS NULL;
