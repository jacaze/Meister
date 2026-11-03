import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedFiscalParameters() {
  const parameters = [
    {
      year: 2025,
      meiAnnualLimit: 81000.0,
      meiMonthlyReference: 6750.0,
      tolerancePct: 0.2,
      minimumWage: 1518.0,
      icmsAmount: 1.0,
      issAmount: 5.0,
      inssPct: 0.05,
    },
    {
      year: 2026,
      meiAnnualLimit: 81000.0,
      meiMonthlyReference: 6750.0,
      tolerancePct: 0.2,
      minimumWage: 1621.0,
      icmsAmount: 1.0,
      issAmount: 5.0,
      inssPct: 0.05,
    },
  ];

  for (const param of parameters) {
    await prisma.fiscalParameters.upsert({
      where: { year: param.year },
      create: param,
      update: param,
    });
  }
}

async function main() {
  console.log('Seeding fiscal parameters...');
  await seedFiscalParameters();
  console.log('Seeding completed successfully.');
}

if (process.argv[1]?.includes('seed.ts')) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
