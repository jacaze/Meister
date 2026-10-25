const userService = require('../services/userService');

async function me(request, reply) {
  try {
    const profile = await userService.getProfile(request.userId);
    return reply.status(200).send(profile);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function updateMe(request, reply) {
  try {
    const profile = await userService.update(request.userId, request.body);
    return reply.status(200).send(profile);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

module.exports = { me, updateMe };
