-- "Não é renda" (entrada importada que não é renda nem faturamento): perna única de transferência.
-- Só acrescenta valores ao enum: nenhuma linha existente muda, nenhum lock longo, rollback de app seguro
-- (o código antigo nunca grava estes valores e já trata transfer_group_id preenchido como transferência).
-- PostgreSQL 12+ aceita ADD VALUE dentro de transação (o valor novo só não pode ser usado nela mesma).
ALTER TYPE "TransferType" ADD VALUE 'own_account';
ALTER TYPE "TransferType" ADD VALUE 'refund';
