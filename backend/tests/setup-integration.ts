import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

// Helper para mascarar senhas em URLs de conexão antes de imprimir em logs ou erros
export function maskDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    // Se a URL não for parseável por URL(), mascara qualquer padrão :senha@ com regex
    return rawUrl.replace(/(:)([^:@/]+)(@)/, '$1***$3');
  }
}

// 1. Carregar variáveis de teste:
// Se DATABASE_URL já foi fornecida pelo ambiente (ex: CI), ela tem prioridade.
// Caso contrário, carrega backend/.env.test se existir, ou fallback para backend/.env.test.example.
if (!process.env.DATABASE_URL) {
  const envTestPath = path.join(backendDir, '.env.test');
  const envTestExamplePath = path.join(backendDir, '.env.test.example');

  if (existsSync(envTestPath)) {
    dotenv.config({ path: envTestPath });
  } else if (existsSync(envTestExamplePath)) {
    dotenv.config({ path: envTestExamplePath });
  }
}

// 2. Garantir variáveis auxiliares de teste
process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'ci_test_only_secret_key_with_at_least_32_characters_long';
}

// 3. GUARDA DE SEGURANÇA:
// O banco de dados alvo DEVE terminar com '_test'.
// Isso impede que comandos de limpeza e testes de integração rodem acidentalmente contra
// o banco de desenvolvimento ('meister') ou produção.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('❌ [Segurança de Testes] DATABASE_URL não está definida para os testes de integração.');
}

try {
  const parsed = new URL(dbUrl);
  const dbName = parsed.pathname.replace(/^\//, '');

  if (!dbName.endsWith('_test')) {
    const errorMsg =
      `❌ [Trava de Segurança de Testes] Abortando execução!\n` +
      `O banco de dados configurado em DATABASE_URL ("${dbName}") NÃO termina com o sufixo obrigatório "_test".\n` +
      `Para proteger os dados locais e de demonstração, testes de integração só podem rodar em um banco isolado (ex: "meister_test").\n` +
      `Verifique seu backend/.env.test ou execute "npm run db:test:prepare".`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
} catch (err: unknown) {
  if (err instanceof Error && err.message.includes('[Trava de Segurança de Testes]')) {
    throw err;
  }
  const masked = maskDatabaseUrl(dbUrl);
  throw new Error(`❌ [Segurança de Testes] Formato inválido de DATABASE_URL: ${masked}`);
}
