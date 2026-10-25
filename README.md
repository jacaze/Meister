# MEIster

**O ritmo certo das suas finanças.** Aplicativo de gestão financeira para MEI (Microempreendedor Individual): cadastre receitas e despesas, acompanhe o resultado do mês e fique de olho no limite anual de faturamento.

---

## Funcionalidades

- **Cadastro e login** com senha criptografada (bcrypt) e sessão via token JWT
- **Proteção contra tentativas de acesso:** após 3 senhas incorretas a conta fica bloqueada por um tempo configurável
- **Categorias** de receitas e despesas (criar, listar, editar e excluir)
- **Lançamentos** de receitas e despesas com valor, data, categoria e forma de pagamento
- **Tipo de conta** (MEI ou pessoa física) escolhido no cadastro e alterável depois, direto no card do dashboard
- **Tela de lançamentos** com busca por descrição, filtros (tipo, categoria, forma de pagamento e período), paginação, **edição** e **exclusão**
- **Dashboard financeiro**
  - saldo atual e resumo do período (mês atual, mês anterior ou ano)
  - gráfico de entradas e despesas dos últimos meses
  - totais por categoria
  - **limite anual do MEI** com barra de progresso e alertas (a partir de 80%, ao ultrapassar o teto e ao passar da tolerância de 20%), exibido **apenas para contas MEI**
  - últimos lançamentos e formulário de novo lançamento

> **Limite do MEI:** R$ 81.000,00 por ano, com tolerância de 20% (R$ 97.200,00). O valor é configurável pela variável `MEI_ANNUAL_LIMIT`, caso a legislação mude.

---

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Backend | Node.js, Fastify 5, Prisma ORM 6, PostgreSQL, JWT, bcrypt |
| Frontend | Vite, HTML + JavaScript, Tailwind CSS (via CDN) |

> O frontend já tem React, React Router e Axios instalados para a futura migração das telas, mas as telas atuais ainda não os utilizam.

---

## Estrutura do projeto

```
Meister/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # modelos: User, Category, Transaction
│   │   └── migrations/
│   └── src/
│       ├── server.js              # inicialização do Fastify
│       ├── config/prisma.js       # cliente do Prisma
│       ├── routes/                # definição das rotas
│       ├── controllers/           # recebem a requisição e devolvem a resposta
│       ├── services/              # regras de negócio
│       └── middlewares/           # autenticação (authMiddleware.js)
├── frontend/
│   ├── index.html                 # login e cadastro
│   ├── src/
│   │   ├── pages/dashboard.html   # dashboard
│   │   ├── pages/transactions.html # lançamentos: lista, filtros, editar e excluir
│   │   └── assets/                # logos e imagens
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## Como rodar localmente

### Pré-requisitos

- [Node.js](https://nodejs.org) 22 ou superior
- [PostgreSQL](https://www.postgresql.org/download/) instalado e em execução

### 1. Clonar o repositório

```bash
git clone https://github.com/jacaze/Meister.git
cd Meister
```

### 2. Configurar e iniciar o backend

```bash
cd backend
npm install
```

> Criação do arquivo `.env`

Edite o arquivo `.env` com os seus dados (veja a tabela de variáveis abaixo) e rode as migrações para criar as tabelas:

```bash
npx prisma migrate dev
npm run dev
```

O backend sobe em **http://localhost:3000**. Para conferir, acesse `http://localhost:3000/health`.

### 3. Iniciar o frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O frontend abre em **http://localhost:5173**. Crie uma conta, faça login e você será levado ao dashboard.

> O endereço da API está fixo como `http://localhost:3000/api` no `frontend/index.html` e no `frontend/src/pages/dashboard.html`. Se mudar a porta do backend, ajuste nesses dois arquivos.

---

## Variáveis de ambiente (`backend/.env`)

| Variável | Obrigatória | Descrição | Exemplo |
|---|---|---|---|
| `DATABASE_URL` | Sim | String de conexão do PostgreSQL | `postgresql://usuario:senha@localhost:5432/gestao_financeira` |
| `JWT_SECRET` | Sim | Chave usada para assinar os tokens. Use um valor longo e aleatório | `troque_por_um_valor_aleatorio_grande` |
| `LOCK_TIME_MINUTES` | Sim | Minutos de bloqueio da conta após 3 senhas incorretas | `15` |
| `PORT` | Não | Porta do backend (padrão `3000`) | `3000` |
| `MEI_ANNUAL_LIMIT` | Não | Limite anual de faturamento do MEI em reais (padrão `81000`) | `81000` |

---

## Rotas da API

Todas as rotas, exceto `register`, `login` e `health`, exigem o cabeçalho `Authorization: Bearer <token>`.

### Autenticação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/register` | Cadastro de novo usuário (`name`, `email`, `password` e, opcionalmente, `accountType`: `mei` ou `pessoa_fisica`; sem ele vale `pessoa_fisica`) |
| `POST` | `/api/login` | Login (`email`, `password`); retorna o token JWT e os dados do usuário, incluindo `accountType` |

### Conta

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/me` | Dados públicos do usuário logado: `id`, `name`, `email` e `accountType` |
| `PATCH` | `/api/me` | Altera o tipo de conta (`accountType`: `mei` ou `pessoa_fisica`). Outros campos são ignorados |

### Categorias

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/categories` | Lista as categorias do usuário |
| `POST` | `/api/categories` | Cria categoria (`name`, `type`: `receita` ou `despesa`) |
| `PUT` | `/api/categories/:id` | Atualiza categoria |
| `DELETE` | `/api/categories/:id` | Exclui categoria |

### Lançamentos

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/transactions` | Lista lançamentos paginados, do mais recente ao mais antigo. Filtros opcionais: `search` (descrição), `type`, `categoryId`, `paymentMethod`, `startDate`, `endDate`, `page` e `pageSize` (padrão 20, máximo 100) |
| `POST` | `/api/transactions` | Cria lançamento (`categoryId`, `type`, `description`, `amount`, `transactionDate`, `paymentMethod` opcional) |
| `PUT` | `/api/transactions/:id` | Atualização parcial: envie só os campos que mudam. `paymentMethod: null` limpa a forma de pagamento |
| `DELETE` | `/api/transactions/:id` | Exclui lançamento |

Formas de pagamento aceitas: `dinheiro`, `pix`, `cartao_credito`, `cartao_debito`, `boleto`, `outro`.

A categoria precisa ser do próprio usuário e do mesmo tipo do lançamento (`receita` ou `despesa`).

Resposta da listagem: `items`, `page`, `pageSize`, `total`, `totalPages` e `resumo` (`totalEntradas`, `totalDespesas` e `resultado`, calculados sobre **todos** os lançamentos filtrados, não só a página atual).

### Dashboard

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/dashboard` | Resumo financeiro. Parâmetros opcionais: `startDate`, `endDate`, `categoryId`, `months` (1 a 12, padrão 6). Sem datas, usa o mês atual |

Resposta do dashboard:

- `saldoAtual`: saldo de todos os lançamentos
- `periodo`: entradas, despesas e resultado do período filtrado
- `porCategoria`: totais e percentuais de receitas e despesas por categoria
- `evolucaoMensal`: entradas, despesas e resultado por mês
- `conta`: tipo de conta do usuário (`accountType`)
- `limiteMei`: faturamento do ano, percentual do limite, valor restante e `status` (`ok`, `atencao`, `excedido` ou `desenquadramento`). Vem `null` para contas de pessoa física
- `ultimasTransacoes`: os 5 lançamentos mais recentes

### Outras

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Verifica se o servidor está no ar |

---

## Roadmap

- [x] Cadastro e login com bloqueio por tentativas
- [x] API de categorias e lançamentos
- [x] Dashboard com resumo, gráfico mensal e limite do MEI
- [x] Tela para editar e excluir lançamentos
- [x] Listagem completa de lançamentos com filtros
- [ ] Categorias padrão criadas junto com a conta
- [x] Exibir o limite do MEI apenas para contas do tipo `mei`
- [ ] Limite proporcional no ano de abertura do CNPJ
- [ ] Controle do DAS mensal
- [ ] Migração das telas para React
- [ ] Lançamentos via WhatsApp e Open Finance (campo `origin` já previsto no banco)

---

## Segurança

- Senhas armazenadas apenas como hash (bcrypt)
- Cada usuário só acessa os próprios dados
- Antes de publicar em produção: usar HTTPS, restringir o CORS ao endereço do frontend e definir um `JWT_SECRET` forte
