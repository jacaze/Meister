const transactionController = require('../controllers/transactionController');
const authMiddleware = require('../middlewares/authMiddleware');

async function transactionRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/transactions', transactionController.list);
  fastify.post('/transactions', transactionController.create);
  fastify.put('/transactions/:id', transactionController.update);
  fastify.delete('/transactions/:id', transactionController.remove);
}

module.exports = transactionRoutes;