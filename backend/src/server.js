require('dotenv').config();
const fastify = require('fastify')({ logger: true });

// A partir da v11 o @fastify/cors libera por padrão só GET, HEAD e POST;
// sem listar PUT e DELETE o navegador bloqueia editar e excluir.
fastify.register(require('@fastify/cors'), {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
});

fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'sua_chave_secreta_super_segura'
});

const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

fastify.register(authRoutes, { prefix: '/api' });
fastify.register(categoryRoutes, { prefix: '/api' });
fastify.register(transactionRoutes, { prefix: '/api' });
fastify.register(dashboardRoutes, { prefix: '/api' });

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date() };
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000 });
    console.log('Servidor Fastify rodando na porta 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();