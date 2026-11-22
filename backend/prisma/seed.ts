import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { parseSeedDemoConfig, seedDemo, seedFiscalParameters } from '../src/scripts/seed-demo.js';

// `npx prisma db seed` (dev): parâmetros fiscais sempre; demo só se DEMO_USER_EMAIL/DEMO_USER_PASSWORD
// estiverem definidos. Toda a lógica vive em src/scripts/seed-demo.ts (também usada em produção).
async function main() {
  await seedFiscalParameters();
  if (!process.env.DEMO_USER_EMAIL || !process.env.DEMO_USER_PASSWORD) {
    console.log('Parâmetros fiscais semeados. Defina DEMO_USER_EMAIL e DEMO_USER_PASSWORD para semear também a demo.');
    return;
  }
  // Rodar o seed explicitamente já é a confirmação
  const config = parseSeedDemoConfig(process.env, ['--confirm']);
  const summary = await seedDemo(config);
  console.log(`Demo pronta: ${summary.lancamentosTotal} lançamentos, ${summary.dasTotal} DAS.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : 'Seed falhou');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
