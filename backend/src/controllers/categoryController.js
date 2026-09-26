const categoryService = require('../services/categoryService');

async function list(request, reply) {
  try {
    const categories = await categoryService.list(request.userId);
    return reply.status(200).send(categories);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function create(request, reply) {
  try {
    const category = await categoryService.create(request.userId, request.body);
    return reply.status(201).send(category);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function update(request, reply) {
  try {
    const category = await categoryService.update(
      request.userId,
      request.params.id,
      request.body
    );
    return reply.status(200).send(category);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function remove(request, reply) {
  try {
    await categoryService.remove(request.userId, request.params.id);
    return reply.status(204).send();
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

module.exports = { list, create, update, remove };