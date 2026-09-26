const authService = require('../services/authService');

async function register(request, reply) {
  try {
    const user = await authService.register(request.body);
    return reply.status(201).send(user);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function login(request, reply) {
  try {
    const result = await authService.login(request.body);
    return reply.status(200).send(result);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

module.exports = { register, login };