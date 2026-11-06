-- Tipo da transferência em cada perna (transfer = entre contas próprias, pro_labore = retirada do titular).
-- Antes eram duas migrations (coluna TEXT + conversão para enum); juntas, a coluna já nasce
-- com o tipo certo e a tabela transactions não é reescrita pelo ALTER COLUMN TYPE.

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('transfer', 'pro_labore');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "transfer_type" "TransferType";

-- Backfill pro_labore por transfer_group_id:
-- 1. Qualquer grupo que contenha uma transação com categoria 'pro-labore'
UPDATE "transactions" t
SET "transfer_type" = 'pro_labore'::"TransferType"
WHERE t."transfer_group_id" IS NOT NULL
  AND t."transfer_type" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "transactions" t2
    JOIN "categories" c ON c."id" = t2."category_id"
    WHERE t2."transfer_group_id" = t."transfer_group_id"
      AND c."slug" = 'pro-labore'
  );

-- 2. Qualquer grupo que contenha simultaneamente uma perna de saída de PJ e uma perna de entrada de PF
UPDATE "transactions" t
SET "transfer_type" = 'pro_labore'::"TransferType"
WHERE t."transfer_group_id" IS NOT NULL
  AND t."transfer_type" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "transactions" t_pj
    JOIN "entities" e_pj ON e_pj."id" = t_pj."entity_id"
    WHERE t_pj."transfer_group_id" = t."transfer_group_id"
      AND e_pj."kind" = 'pj'
      AND (t_pj."direction" = 'out' OR t_pj."type" = 'despesa')
  )
  AND EXISTS (
    SELECT 1
    FROM "transactions" t_pf
    JOIN "entities" e_pf ON e_pf."id" = t_pf."entity_id"
    WHERE t_pf."transfer_group_id" = t."transfer_group_id"
      AND e_pf."kind" = 'pf'
      AND (t_pf."direction" = 'in' OR t_pf."type" = 'receita')
  );

-- 3. Todos os demais grupos de transferência pendentes tornam-se 'transfer'
UPDATE "transactions" t
SET "transfer_type" = 'transfer'::"TransferType"
WHERE t."transfer_group_id" IS NOT NULL
  AND t."transfer_type" IS NULL;
