const dashboardService = require('../services/dashboardService');

async function getSummary(request, reply) {
  try {
    const summary = await dashboardService.getSummary(request.userId, request.query);
    return reply.status(200).send(summary);
  } catch (error) {
    return reply.status(error.statusCode || 500).send({ message: error.message });
  }
}

module.exports = { getSummary };