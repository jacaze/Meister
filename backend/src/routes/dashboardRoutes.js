const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware');

async function dashboardRoutes(fastify) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/dashboard', dashboardController.getSummary);
}

module.exports = dashboardRoutes;