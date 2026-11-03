import type { FastifyReply, FastifyRequest } from 'fastify';
import * as dashboardService from '../services/dashboardService.js';

export async function getSummary(request: FastifyRequest, reply: FastifyReply) {
  const query = (request.query ?? {}) as dashboardService.DashboardFilters;
  const summary = await dashboardService.getSummary(request.userId, query);
  return reply.send(summary);
}
