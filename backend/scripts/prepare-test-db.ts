import { execSync } from 'node:child_process';
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

if (!dbName.endsWith('_test')) {
  console.error(`❌ Trava de segurança ativada: o banco de dados "${dbName}" não termina com "_test".`);
  process.exit(1);
}

function prepareTestDatabase() {
  console.log(`🔧 Preparando banco de dados de testes: ${dbName}...`);

  const user = parsedUrl.username || 'meister';
  const password = parsedUrl.password || '';
  const host = parsedUrl.hostname || 'localhost';
  const port = parsedUrl.port || '5432';

  // Usar psql para criar o banco de dados caso não exista conectando em 'postgres'
  const checkCmd = `PGPASSWORD="${password}" psql -h "${host}" -p "${port}" -U "${user}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'"`;
  try {
    const res = execSync(checkCmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    if (res !== '1') {
      console.log(`📦 Criando banco de dados "${dbName}"...`);
      execSync(`PGPASSWORD="${password}" psql -h "${host}" -p "${port}" -U "${user}" -d postgres -c "CREATE DATABASE \\"${dbName}\\";"`, {
        stdio: 'inherit',
      });
      console.log(`✅ Banco "${dbName}" criado com sucesso.`);
    } else {
      console.log(`ℹ️  Banco de dados "${dbName}" já existe.`);
    }
  } catch (err) {
    console.error('❌ Erro ao conectar/criar banco de teste via psql:', err);
    process.exit(1);
  }

  // Rodar prisma migrate deploy no banco de teste
  console.log(`🚀 Executando prisma migrate deploy no banco "${dbName}"...`);
  try {
    execSync('npx prisma migrate deploy', {
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
