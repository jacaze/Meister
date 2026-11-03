import type { FastifyReply, FastifyRequest } from 'fastify';
import * as dashboardService from '../services/dashboardService.js';

export async function getSummary(request: FastifyRequest, reply: FastifyReply) {
  const summary = await dashboardService.getSummary(
    request.userId,
    request.query as dashboardService.DashboardFilters,
    undefined,
    request.scope
  );
  return reply.send(summary);
}
