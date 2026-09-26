const jwt = require('jsonwebtoken');

async function authMiddleware(request, reply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ message: 'Token não informado' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    request.userId = payload.userId;
  } catch (error) {
    return reply.status(401).send({ message: 'Token inválido ou expirado' });
  }
}

module.exports = authMiddleware;