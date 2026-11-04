export interface QuizQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number; // 0-based index
  readonly explanation: string;
}

export interface Lesson {
  readonly slug: string;
  readonly title: string;
  readonly version: number;
  readonly status: 'rascunho' | 'revisada';
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly estimatedMinutes: number;
  readonly triggers: readonly string[];
  readonly summary: string;
  readonly content: string;
  readonly quiz: readonly QuizQuestion[];
}

export const CURATED_LESSONS: readonly Lesson[] = [
  {
    slug: 'separar-pf-pj',
    title: 'Separar as Contas: O Primeiro Passo para o Lucro',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 3,
    triggers: ['pf_expense_in_pj', 'onboarding'],
    summary: 'Aprenda por que misturar gastos pessoais e do negócio destrói seu controle e pode trazer problemas fiscais.',
    content: `
# Separar as Contas: PF vs. PJ

Misturar despesas da casa com o dinheiro do negócio é o principal motivo de falência nos primeiros anos de um empreendimento.

### O que acontece quando você mistura:
1. **Você não sabe se tem lucro real:** Pagar a conta de luz de casa com o cartão da empresa esconde a verdadeira margem de lucro do seu serviço ou produto.
2. **Risco com a Receita Federal:** A Receita monitora a movimentação de contas bancárias de empresas. Movimentar gastos puramente pessoais na conta PJ pode descaracterizar a natureza do negócio.
3. **Falsa sensação de riqueza:** Ter dinheiro no saldo da conta PJ não significa que esse dinheiro é seu para gastar no final de semana. Parte dele pertence a fornecedores, impostos e custos operacionais futuros.

### A Regra de Ouro do MEIster:
* **Entradas do negócio:** Sempre caem na conta PJ (ou são marcadas com entidade PJ).
* **Gastos do negócio:** São pagos exclusivamente com o dinheiro do negócio.
* **Seu salário (Pró-labore):** Você transfere um valor fixo mensal da conta PJ para a sua conta PF. A partir daí, seus gastos pessoais saem unicamente da conta pessoal.
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Por que o MEI deve evitar pagar supermercado ou compras pessoais com a conta PJ?',
        options: [
          'Porque a legislação proíbe qualquer pessoa física de ter conta de banco.',
          'Porque distorce o cálculo do lucro do negócio e gera inconsistências fiscais.',
          'Porque o banco cobra uma multa de R$ 500,00 por compra pessoal no cartão PJ.',
        ],
        correct: 1,
        explanation: 'Misturar compras pessoais oculta os custos operacionais reais da empresa e pode levantar alertas perante o fisco.',
      },
      {
        id: 'q2',
        question: 'Qual é o procedimento correto para pagar as despesas de casa sendo MEI?',
        options: [
          'Definir uma retirada de pró-labore da conta PJ para a conta PF e pagar as contas a partir da conta PF.',
          'Pagar direto pelo aplicativo da conta da empresa marcando como doação.',
          'Usar sempre o cartão de crédito PJ para acumular pontos na empresa.',
        ],
        correct: 0,
        explanation: 'O fluxo financeiro saudável exige transferir a remuneração estipulada para a conta PF e dali custear a vida pessoal.',
      },
    ],
  },
  {
    slug: 'limite-mei-80',
    title: 'Você Chegou a 80% do Limite — E Agora?',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 4,
    triggers: ['limit_band_atencao', 'limit_band_60'],
    summary: 'Entenda os limites de faturamento do MEI ({{limite_mei}}), as faixas de tolerância de 20% e como planejar a transição para ME.',
    content: `
# Limite de Faturamento do MEI

O limite anual padrão do Microempreendedor Individual é de **{{limite_mei}}** por ano (ou proporcional aos meses de abertura, no valor de R$ 6.750,00 por mês ativo).

Quando você ultrapassa **{{limite_atencao}}** (80% do teto), é hora de ligar o sinal de alerta e planejar seus próximos passos com calma.

### Os 2 Cenários ao Ultrapassar o Limite:

#### Cenário 1: Ultrapassou em até 20% (Até {{limite_tolerancia}})
* Você continua recolhendo o DAS normal até dezembro do ano corrente.
* Em janeiro do ano seguinte, você emite um **DAS complementar de excesso** recolhendo os tributos devidos sobre a quantia que excedeu {{limite_mei}}.
* A partir de 1º de janeiro seguinte, sua empresa passa automaticamente a ser **Microempresa (ME)** no Simples Nacional.

#### Cenário 2: Ultrapassou mais de 20% (Acima de {{limite_tolerancia}})
* O desenquadramento é **retroativo** ao dia 1º de janeiro daquele ano (ou à data de abertura).
* Você terá que recolher todos os impostos do ano retroativamente como ME, com juros e multa sobre o faturamento total.

### Recomendações:
* Ao bater 80%, projete suas faturas até o final do ano.
* Procure um contador de confiança para preparar a transição para Microempresa caso seu crescimento seja consistente. Crescer e faturar mais é excelente, desde que planejado!
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'O que acontece se o faturamento do ano fechar acima do limite anual, porém em até 20% de excesso?',
        options: [
          'A empresa é cancelada imediatamente sem direito a recurso.',
          'Paga DAS complementar sobre o excesso em janeiro seguinte e migra para ME sem multas retroativas.',
          'O empreendedor deve pagar multa de 50% sobre todo o faturamento daquele ano.',
        ],
        correct: 1,
        explanation: 'Ultrapassando até 20%, o MEI conclui o ano e recolhe os tributos apenas sobre a quantia excedente na DASN, mudando para ME no ano seguinte.',
      },
      {
        id: 'q2',
        question: 'Qual é o risco de ultrapassar o limite anual em mais de 20%?',
        options: [
          'Desenquadramento retroativo a janeiro daquele ano com recálculo de impostos, juros e multas sobre todo o faturamento.',
          'Não há risco algum se as notas forem emitidas para pessoas físicas.',
          'Apenas a perda do CNPJ sem cobrança retroativa.',
        ],
        correct: 0,
        explanation: 'Ultrapassar em mais de 20% gera desenquadramento retroativo desde o início do ano fiscal, com impostos devidos na tabela do Simples Nacional.',
      },
    ],
  },
  {
    slug: 'o-que-e-das',
    title: 'O que é o DAS MEI e Como Pagar em Dia',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 3,
    triggers: ['first_das', 'das_overdue'],
    summary: 'Conheça o Documento de Arrecadação do Simples Nacional, benefícios previdenciários e como evitar multas.',
    content: `
# O que é o DAS MEI?

O **DAS (Documento de Arrecadação do Simples Nacional)** é a guia única mensal pela qual o MEI recolhe seus tributos e mantém seu CNPJ regular perante a Receita Federal e a Previdência Social.

### O que está incluso no DAS?
1. **INSS (Previdência Social):** 5% do salário mínimo vigente. Garante seus direitos previdenciários (aposentadoria por idade, auxílio-doença, salário-maternidade).
2. **ICMS (Comércio/Indústria):** R$ 1,00 para o Estado.
3. **ISS (Prestação de Serviços):** R$ 5,00 para o Município.

### Vencimento:
* O DAS vence todo **dia 20 de cada mês** (se cair em final de semana ou feriado, prorroga-se para o primeiro dia útil seguinte).
* Mesmo que o MEI **não tenha faturado nada no mês**, o pagamento do DAS continua sendo obrigatório para manter o benefício previdenciário e o CNPJ ativo.

### Como evitar esquecimentos:
* No MEIster, você pode acompanhar todas as guias do ano e registrar quando pagar.
* O atraso gera cobrança de multa diária (0,33% ao dia até o teto de 20%) mais juros Selic.
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Se em um determinado mês o MEI não teve nenhuma receita ou venda, o DAS precisa ser pago?',
        options: [
          'Sim, o pagamento é obrigatório todo mês mesmo sem faturamento para manter a regularidade do CNPJ e a cobertura do INSS.',
          'Não, o DAS é automaticamente zerado quando não há emissão de notas.',
          'Apenas se a empresa tiver funcionários contratados.',
        ],
        correct: 0,
        explanation: 'O valor do DAS é fixo e mensal. Ele mantém seus direitos junto à Previdência Social mesmo em períodos sem faturamento.',
      },
      {
        id: 'q2',
        question: 'Qual é o dia de vencimento padrão da guia do DAS?',
        options: [
          'No último dia útil do mês.',
          'Dia 20 de cada mês (ou próximo dia útil).',
          'Dia 10 de cada mês.',
        ],
        correct: 1,
        explanation: 'A legislação do Simples Nacional estipula o dia 20 de cada mês como data de vencimento do DAS MEI.',
      },
    ],
  },
  {
    slug: 'fluxo-de-caixa',
    title: 'Fluxo de Caixa Simples: Entradas, Saídas e Sobras',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 3,
    triggers: ['first_full_month'],
    summary: 'Como organizar as entradas e saídas no MEIster para nunca ser pego de surpresa no final do mês.',
    content: `
# Fluxo de Caixa para Microempreendedores

O fluxo de caixa não é apenas somar o quanto sobrou no banco; é o termômetro da saúde e da sobrevida do seu negócio.

### Os 3 Pilares do Fluxo:
1. **Entradas (Receitas):** Tudo o que entra via Pix, cartão, boleto ou dinheiro resultante das vendas e serviços.
2. **Saídas (Custos e Despesas):**
   * *Custos Diretos:* Insumos, matérias-primas e fretes necessários para realizar o trabalho.
   * *Despesas Fixas:* DAS, internet, aluguel, ferramentas de software, tarifas de conta.
3. **Saldo Operacional:** Entradas menos saídas. É essa sobra que financia seu pró-labore e reinvestimentos.

### Dica Prática de Gestão:
* Registre todo e qualquer gasto imediatamente — mande um áudio ou foto de comprovante no Telegram do MEIster ou anote na hora.
* Não espere o fim do mês para descobrir se a conta fechou no azul.
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Qual é a principal função do controle de fluxo de caixa?',
        options: [
          'Aumentar o limite do cartão de crédito no banco.',
          'Permitir prever a disponibilidade financeira e entender onde o dinheiro está sendo gasto antes de faltar no caixa.',
          'Substituir a necessidade de pagar impostos estaduais.',
        ],
        correct: 1,
        explanation: 'O fluxo de caixa fornece clareza antecipada para tomada de decisões financeiras e corte de gastos desnecessários.',
      },
    ],
  },
  {
    slug: 'metodo-dos-potes',
    title: 'O Método dos Potes Financeiros: Dando Destino ao Dinheiro',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 3,
    triggers: ['jar_plan_created', 'jar_over'],
    summary: 'Entenda como dividir percentualmente cada entrada entre Operação, Impostos, Reserva e Pró-labore.',
    content: `
# O Método dos Potes Financeiros

Quem não define o destino de cada real antes de gastar acaba sem dinheiro para o essencial.

No MEIster, o método dos potes distribui automaticamente suas receitas confirmadas em porcentagens matematicamente exatas (método do maior resto):

### Template Padrão MEI Empresa:
* **Operação (50%):** Compra de insumos, softwares, ferramentas, transporte e despesas do dia a dia da empresa.
* **Impostos / DAS (Fixo ou 10%):** O dinheiro sagrado do DAS mensal para nunca correr o risco de atrasar.
* **Reserva de Caixa (15%):** Saldo cumulativo (*rollover*) para meses fracos ou imprevistos de maquinário.
* **Reinvestimento (10%):** Cursos, marketing, novos equipamentos para expandir seu negócio.
* **Pró-labore (15%):** A sua remuneração merecida transferida para a sua conta pessoa física.

### Dica de Ouro:
Ao categorizar uma despesa, ela automaticamente consome o saldo do pote respectivo. Se o pote atingir 80%, o MEIster alerta você para desacelerar gastos supérfluos!
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Qual é a função do pote de Reserva de Caixa no método dos potes?',
        options: [
          'Acumular dinheiro de meses bons para garantir despesas fixas em períodos de baixa demanda ou emergências operacionais.',
          'Gastar todo mês com presentes para clientes.',
          'Pagar multas de trânsito do empreendedor.',
        ],
        correct: 0,
        explanation: 'A reserva operacional garante a perenidade do negócio em momentos de sazonalidade ou imprevistos técnicos.',
      },
    ],
  },
  {
    slug: 'reserva-de-caixa',
    title: 'Reserva de Emergência e Caixa Operacional',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 3,
    triggers: ['reserve_empty_2m'],
    summary: 'Descubra quanto você deve guardar para manter seu negócio funcionando mesmo se as vendas caírem.',
    content: `
# Reserva de Caixa e Emergência do MEI

Autônomos e microempreendedores não contam com seguro-desemprego ou FGTS. Por isso, a sua segurança é construída por você mesmo.

### Quantos meses guardar?
* **O objetivo ideal:** Ter o equivalente a **3 a 6 meses de custos fixos da empresa** guardados no pote de Reserva.
* Se os seus custos fixos operacionais somam R$ 1.500,00 por mês, uma meta segura de reserva está entre R$ 4.500,00 e R$ 9.000,00.

### Como formar a reserva sem sufocar o dia a dia:
1. Comece pequeno: Guarde 5% ou 10% de cada entrada que receber.
2. Seja disciplinado: Trate o valor da reserva como um compromisso fixo, não como uma "sobra".
3. Mantenha o dinheiro em aplicações de liquidez diária e alta segurança (conta remunerada do banco PJ com 100% do CDI).
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Qual é a recomendação para o tamanho ideal de uma reserva operacional do MEI?',
        options: [
          'O valor de um único almoço.',
          'De 3 a 6 meses dos custos fixos da empresa.',
          'De 5 anos de faturamento total bruto.',
        ],
        correct: 1,
        explanation: 'De 3 a 6 meses de custos fixos garantem tranquilidade durante quedas temporárias de demanda.',
      },
    ],
  },
  {
    slug: 'prolabore-lucro',
    title: 'Pró-labore vs. Lucro: Quanto e Como Retirar',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 4,
    triggers: ['withdrawal_high'],
    summary: 'Saiba como remunerar seu trabalho sem sangrar o caixa da sua microempresa.',
    content: `
# Pró-labore vs. Distribuição de Lucros no MEI

Muitos empreendedores confundem o faturamento do negócio com o salário que podem gastar na sua vida privada.

### A Diferença:
* **Pró-labore:** É a remuneração pelo trabalho que você realiza diariamente no negócio. Tem valor periódico e previsível (por exemplo, 1 salário mínimo ou um valor fixado conforme a capacidade da empresa).
* **Distribuição de Lucro:** É a divisão das sobras reais após o pagamento de todos os custos, despesas, impostos e alimentação da reserva de caixa.

### Como fazer na prática:
1. Defina um dia fixo no mês (ex.: dia 5 ou dia 10) para transferir o seu pró-labore da conta PJ para a sua conta PF.
2. Registre essa transação no MEIster como retirada / pró-labore.
3. Se o mês for muito bom, não gaste tudo: parte do lucro deve ser reinvestida para o negócio crescer ainda mais.
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Qual é a melhor prática para o MEI retirar dinheiro do negócio para pagar suas despesas pessoais?',
        options: [
          'Transferir valores desordenados da conta jurídica toda vez que precisar pagar um boleto pessoal.',
          'Estipular um valor mensal previsível de pró-labore, transferindo-o em data fixa para a conta física.',
          'Nunca transferir dinheiro e usar apenas o cartão de débito da empresa.',
        ],
        correct: 1,
        explanation: 'A previsibilidade de pró-labore em data regular garante ordem no fluxo de caixa e planejamento financeiro doméstico.',
      },
    ],
  },
  {
    slug: 'dasn-simei',
    title: 'DASN-SIMEI: A Declaração Anual Sem Segredos',
    version: 1,
    status: 'revisada',
    reviewedBy: 'Equipe Contábil MEIster',
    reviewedAt: '2026-11-01',
    estimatedMinutes: 3,
    triggers: ['dasn_season'],
    summary: 'Tudo o que você precisa saber sobre a entrega da Declaração Anual do Simples Nacional transmitida até 31 de maio.',
    content: `
# Declaração Anual do MEI (DASN-SIMEI)

A DASN-SIMEI é a declaração anual obrigatória que todo Microempreendedor Individual deve transmitir à Receita Federal até o dia **31 de maio** de cada ano.

### O que você declara na DASN?
1. O valor total da receita bruta obtida no ano anterior (separando vendas de comércio/indústria e prestação de serviços).
2. Se contratou ou não empregado durante o período.

### Dica importante:
* Manter seus lançamentos organizados mês a mês no MEIster torna a declaração anual um processo de 2 minutos: basta consultar o relatório anual na aba de Relatórios do app e copiar os valores consolidados.
* A não entrega ou entrega em atraso acarreta multa mínima de R$ 50,00 e pode travar a emissão de notas fiscais e benefícios previdenciários.
    `.trim(),
    quiz: [
      {
        id: 'q1',
        question: 'Até que data deve ser transmitida anualmente a DASN-SIMEI à Receita Federal?',
        options: [
          'Até o dia 31 de dezembro.',
          'Até o dia 31 de maio do ano seguinte.',
          'Até o dia 10 de janeiro.',
        ],
        correct: 1,
        explanation: 'O prazo limite legal para entrega da declaração anual do MEI sem multa é 31 de maio.',
      },
    ],
  },
];
