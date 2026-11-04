import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { provisionWorkspace, resolveScopeForUser, updateBusinessProfile } from '../src/modules/workspace/public.js';
import { seedDefaultCategories } from '../src/modules/catalog/public.js';
import { createJarPlan } from '../src/modules/jars/public.js';
import { ensureDasCharges } from '../src/modules/fiscal/public.js';

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

export async function seedDemoUser() {
  const email = 'demo@meister.com';
  const rawPassword = 'senha123';

  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (!user) {
    console.log(`Creating demo user: ${email}...`);
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    user = await prisma.user.create({
      data: {
        name: 'Lucas MEI',
        email,
        passwordHash,
        accountType: 'mei',
      },
    });

    const provision = await provisionWorkspace({
      userId: user.id,
      accountType: 'mei',
      workspaceName: 'Workspace Demonstração',
    });

    await seedDefaultCategories({
      workspaceId: provision.workspaceId,
      userId: user.id,
      isMei: true,
    });
  }

  const scope = await resolveScopeForUser(user.id);
  const pjEntityId = scope.defaultEntityIds.pj!;

  // Complete business profile if not already set
  const currentEntity = await prisma.entity.findUnique({
    where: { id: pjEntityId },
  });

  if (!currentEntity?.cnpj) {
    try {
      // 33.000.167/0001-01 has valid checksum digits
      await updateBusinessProfile(scope, {
        entityId: pjEntityId,
        cnpj: '33000167000101',
        legalName: 'Lucas MEI Soluções Tecnológicas',
        openedOn: '2026-01-10',
        activity: 'servicos',
      });
    } catch (err) {
      console.warn('CNPJ already set or skipped:', err);
    }
  }

  // Create Jar Plan if not exists
  const existingPlan = await prisma.jarPlan.findFirst({
    where: { workspaceId: scope.workspaceId, active: true },
  });

  if (!existingPlan) {
    await createJarPlan(scope, {
      templateSlug: 'mei-empresa',
      entityId: pjEntityId,
    });
  }

  // Ensure DAS charges
  await ensureDasCharges(scope);

  // Create some sample transactions if none
  const existingTx = await prisma.transaction.count({
    where: { workspaceId: scope.workspaceId },
  });

  if (existingTx === 0) {
    const categories = await prisma.category.findMany({
      where: { workspaceId: scope.workspaceId },
    });

    const servicosCat = categories.find((c) => c.slug === 'servicos' || c.type === 'receita');
    const softwareCat = categories.find((c) => c.slug === 'software' || c.type === 'despesa');

    if (servicosCat) {
      await prisma.transaction.create({
        data: {
          workspaceId: scope.workspaceId,
          userId: user.id,
          entityId: pjEntityId,
          categoryId: servicosCat.id,
          type: 'receita',
          amount: 4500.0,
          description: 'Consultoria de Desenvolvimento Web',
          transactionDate: new Date(),
          paymentMethod: 'pix',
        },
      });

      await prisma.transaction.create({
        data: {
          workspaceId: scope.workspaceId,
          userId: user.id,
          entityId: pjEntityId,
          categoryId: servicosCat.id,
          type: 'receita',
          amount: 3200.0,
          description: 'Projeto de Integração de Sistemas',
          transactionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          paymentMethod: 'pix',
        },
      });
    }

    if (softwareCat) {
      await prisma.transaction.create({
        data: {
          workspaceId: scope.workspaceId,
          userId: user.id,
          entityId: pjEntityId,
          categoryId: softwareCat.id,
          type: 'despesa',
          amount: 450.0,
          description: 'Assinatura Servidor Cloud & Domínio',
          transactionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          paymentMethod: 'cartao_credito',
        },
      });
    }
  }

  console.log('Demo user and sample data verified & fully configured!');
}

async function main() {
  console.log('Seeding fiscal parameters...');
  await seedFiscalParameters();
  console.log('Seeding demo user and workspace...');
  await seedDemoUser();
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
