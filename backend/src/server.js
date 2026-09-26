require('dotenv').config();
const fastify = require('fastify')({ logger: true });

fastify.register(require('@fastify/cors'), { origin: '*' });
fastify.register(require('./routes/authRoutes'));
fastify.register(require('./routes/categoryRoutes'));
fastify.register(require('./routes/transactionRoutes'));
fastify.register(require('./routes/dashboardRoutes'));

fastify.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();