-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lock_until" TIMESTAMP(3);
