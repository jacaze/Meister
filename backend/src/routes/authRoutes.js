const authController = require('../controllers/authController');

async function authRoutes(fastify) {
  fastify.post('/auth/register', authController.register);
  fastify.post('/auth/login', authController.login);
}

module.exports = authRoutes;