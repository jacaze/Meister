require('dotenv').config();
const fastify = require('fastify')({ logger: true });

fastify.register(require('@fastify/cors'), { origin: '*' });

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