const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

async function userRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/me', userController.me);
  fastify.patch('/me', userController.updateMe);
}

module.exports = userRoutes;
