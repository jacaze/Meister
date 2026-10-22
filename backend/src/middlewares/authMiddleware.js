const jwt = require('jsonwebtoken');

async function authMiddleware(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ message: 'Token não informado' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Aceita "userId" (padrão atual) e "id" (tokens emitidos antes da correção do login)
    const userId = payload.userId || payload.id;

    // Sem userId o Prisma ignora o filtro `where: { userId }` e devolveria dados de
    // todos os usuários. Por isso nunca seguimos adiante sem ele.
    if (!userId) {
      return reply.status(401).send({ message: 'Token inválido' });
    }

    request.userId = userId;
  } catch (error) {
    return reply.status(401).send({ message: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;
