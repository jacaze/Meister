-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "paid_by_entity_id" TEXT;

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "debtor_entity_id" TEXT NOT NULL,
    "creditor_entity_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "settled_via" TEXT,
    "settled_at" TIMESTAMP(3),
    "settled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlements_transaction_id_key" ON "settlements"("transaction_id");

-- CreateIndex
CREATE INDEX "settlements_workspace_id_status_idx" ON "settlements"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "settlements_debtor_entity_id_creditor_entity_id_idx" ON "settlements"("debtor_entity_id", "creditor_entity_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_by_entity_id_fkey" FOREIGN KEY ("paid_by_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_debtor_entity_id_fkey" FOREIGN KEY ("debtor_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_creditor_entity_id_fkey" FOREIGN KEY ("creditor_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

