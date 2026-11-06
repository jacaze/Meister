import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

// 1. Carregar variáveis: prioridade para .env.test se existir, senão .env.test.example ou process.env
const envTestPath = path.join(backendDir, '.env.test');
const envTestExamplePath = path.join(backendDir, '.env.test.example');

if (existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
} else if (existsSync(envTestExamplePath)) {
  console.warn(
    '⚠️  [Aviso] backend/.env.test não encontrado. Usando backend/.env.test.example por padrão.\n' +
    '   Para customizar seu ambiente de testes local, crie o arquivo: cp backend/.env.test.example backend/.env.test'
  );
  dotenv.config({ path: envTestExamplePath });
} else {
  dotenv.config();
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL não definida para preparação do banco de teste.');
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
const dbName = parsedUrl.pathname.replace(/^\//, '');

// Trava de segurança: somente bancos com sufixo _test
if (!dbName.endsWith('_test')) {
  console.error(`❌ Trava de segurança ativada: o banco de dados "${dbName}" não termina com "_test".`);
  process.exit(1);
}

function prepareTestDatabase() {
  console.log(`🔧 Preparando banco de dados de testes: ${dbName}...`);
  console.log(`🚀 Executando prisma migrate deploy no banco "${dbName}"...`);

  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: backendDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    });
    console.log(`✨ Banco de testes "${dbName}" pronto e migrado com sucesso!`);
  } catch (err) {
    console.error('❌ Falha ao rodar migrations no banco de testes:', err);
    process.exit(1);
  }
}

prepareTestDatabase();
