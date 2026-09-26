const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middlewares/authMiddleware');

async function categoryRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/categories', categoryController.list);
  fastify.post('/categories', categoryController.create);
  fastify.put('/categories/:id', categoryController.update);
  fastify.delete('/categories/:id', categoryController.remove);
}

module.exports = categoryRoutes;