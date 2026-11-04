import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clean existing test data safely
  await prisma.aiRun.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.telegramChatConnection.deleteMany();
  await prisma.telegramLinkToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.dasPayment.deleteMany();
  await prisma.dasGuide.deleteMany();
  await prisma.jarHistory.deleteMany();
  await prisma.jarCategory.deleteMany();
  await prisma.jar.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryTemplateItem.deleteMany();
  await prisma.categoryTemplate.deleteMany();
  await prisma.meiProfile.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Demo User
  const passwordHash = await bcrypt.hash('Senha123@', 10);
  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@meister.com',
      passwordHash,
      name: 'Lucas Consultoria',
    },
  });

  // 3. Create Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Lucas MEI Tech',
      slug: 'lucas-mei-tech',
      members: {
        create: {
          userId: demoUser.id,
          role: 'OWNER',
        },
      },
    },
  });

  // 4. Create Entities (PJ and PF)
  const pjEntity = await prisma.entity.create({
    data: {
      workspaceId: workspace.id,
      type: 'PJ',
      name: 'Lucas Ortiz Consultoria MEI',
      taxId: '54.123.456/0001-89',
    },
  });

  const pfEntity = await prisma.entity.create({
    data: {
      workspaceId: workspace.id,
      type: 'PF',
      name: 'Lucas Ortiz',
      taxId: '123.456.789-00',
    },
  });

  // 5. Create MEI Profile
  await prisma.meiProfile.create({
    data: {
      entityId: pjEntity.id,
      annualLimit: 81000.0,
      currentYear: 2026,
      accumulatedGrossRevenue: 18500.0,
      activityType: 'SERVICOS',
    },
  });

  // 6. Create Category Template & Default Categories
  const template = await prisma.categoryTemplate.create({
    data: {
      slug: 'mei-empresa',
      name: 'Padrão MEI Prestador de Serviços',
      description: 'Estrutura recomendada para pequenos empreendedores',
    },
  });

  const categoriesData = [
    { name: 'Prestação de Serviços', slug: 'servicos-prestados', type: 'receita', icon: 'briefcase', isDeductible: false },
    { name: 'Venda de Produtos', slug: 'venda-produtos', type: 'receita', icon: 'shopping-bag', isDeductible: false },
    { name: 'Alimentação & Refeições', slug: 'alimentacao', type: 'despesa', icon: 'coffee', isDeductible: true },
    { name: 'Transporte & Combustível', slug: 'transporte', type: 'despesa', icon: 'truck', isDeductible: true },
    { name: 'Equipamentos e Software', slug: 'tecnologia', type: 'despesa', icon: 'laptop', isDeductible: true },
    { name: 'DAS MEI / Impostos', slug: 'impostos-das', type: 'despesa', icon: 'file-text', isDeductible: false },
    { name: 'Pró-Labore / Retiradas', slug: 'pro-labore', type: 'despesa', icon: 'user', isDeductible: false },
  ];

  const createdCategories: Record<string, string> = {};

  for (const cat of categoriesData) {
    const c = await prisma.category.create({
      data: {
        workspaceId: workspace.id,
        name: cat.name,
        slug: cat.slug,
        type: cat.type,
        icon: cat.icon,
        isDeductible: cat.isDeductible,
      },
    });
    createdCategories[cat.slug] = c.id;
  }

  // 7. Create Jars (Potes Orçamentários)
  const jarEssenciais = await prisma.jar.create({
    data: {
      workspaceId: workspace.id,
      entityId: pjEntity.id,
      name: 'Custos Operacionais',
      monthlyCap: 1200.0,
      spentThisMonth: 450.0,
      ruleType: 'EXPENSE_CAP',
      categories: {
        create: [
          { categoryId: createdCategories['tecnologia'] },
          { categoryId: createdCategories['transporte'] },
        ],
      },
    },
  });

  const jarAlimentacao = await prisma.jar.create({
    data: {
      workspaceId: workspace.id,
      entityId: pfEntity.id,
      name: 'Alimentação Diária',
      monthlyCap: 800.0,
      spentThisMonth: 120.0,
      ruleType: 'EXPENSE_CAP',
      categories: {
        create: [
          { categoryId: createdCategories['alimentacao'] },
        ],
      },
    },
  });

  // 8. Seed sample transactions
  await prisma.transaction.createMany({
    data: [
      {
        workspaceId: workspace.id,
        entityId: pjEntity.id,
        categoryId: createdCategories['servicos-prestados'],
        type: 'receita',
        amount: 3500.0,
        description: 'Desenvolvimento de Landing Page - Cliente Alfa',
        paymentMethod: 'PIX',
        transactionDate: new Date('2026-11-01T10:00:00Z'),
        status: 'CONFIRMED',
      },
      {
        workspaceId: workspace.id,
        entityId: pjEntity.id,
        categoryId: createdCategories['tecnologia'],
        type: 'despesa',
        amount: 149.9,
        description: 'Assinatura Claude / Vercel Pro',
        paymentMethod: 'CREDIT_CARD',
        transactionDate: new Date('2026-11-02T14:30:00Z'),
        status: 'CONFIRMED',
      },
      {
        workspaceId: workspace.id,
        entityId: pfEntity.id,
        categoryId: createdCategories['alimentacao'],
        type: 'despesa',
        amount: 45.0,
        description: 'Almoço Executivo',
        paymentMethod: 'DEBIT_CARD',
        transactionDate: new Date('2026-11-03T12:15:00Z'),
        status: 'CONFIRMED',
      },
    ],
  });

  console.log('✅ Seed completed successfully:');
  console.log(`   User: demo@meister.com (Senha123@)`);
  console.log(`   Workspace: ${workspace.name} (${workspace.id})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
