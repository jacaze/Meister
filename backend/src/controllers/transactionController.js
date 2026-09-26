const transactionService = require('../services/transactionService');

async function list(request, reply) {
  try {
    const transactions = await transactionService.list(request.userId, request.query);
    return reply.status(200).send(transactions);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function create(request, reply) {
  try {
    const transaction = await transactionService.create(request.userId, request.body);
    return reply.status(201).send(transaction);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function update(request, reply) {
  try {
    const transaction = await transactionService.update(
      request.userId,
      request.params.id,
      request.body
    );
    return reply.status(200).send(transaction);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

async function remove(request, reply) {
  try {
    await transactionService.remove(request.userId, request.params.id);
    return reply.status(204).send();
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

module.exports = { list, create, update, remove };