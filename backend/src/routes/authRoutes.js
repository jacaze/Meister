const LOCK_TIME_MINUTES = Number(process.env.LOCK_TIME_MINUTES)
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

module.exports = async function (fastify, options) {

  fastify.post('/register', async (request, reply) => {
    try {
      const { name, email, password } = request.body;

      if (!name || !email || !password) {
        return reply.status(400).send({ message: 'Nome, e-mail e senha são obrigatórios.' });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return reply.status(400).send({ message: 'Este e-mail já está em uso.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: hashedPassword
        }
      });

      return reply.status(201).send({
        message: 'Usuário cadastrado com sucesso!',
        user: { id: newUser.id, name: newUser.name, email: newUser.email }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: 'Erro ao cadastrar usuário.' });
    }
  });

  fastify.post('/login', async (request, reply) => {
    try {
      const { email, password } = request.body;

      if (!email || !password) {
        return reply.status(400).send({ message: 'Informe e-mail e senha.' });
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
      }

      const now = new Date();
      if (user.lockUntil && user.lockUntil > now) {
        const remainingMinutes = Math.ceil((new Date(user.lockUntil) - now) / 60000);
        return reply.status(403).send({
          message: `Conta bloqueada temporariamente. Tente novamente em ${remainingMinutes} minuto(s).`
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        const newAttempts = user.failedAttempts + 1;
        const isThirdAttempt = newAttempts >= 3;

        let lockUntilDate = null;
        if (isThirdAttempt) {
          lockUntilDate = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: isThirdAttempt ? 0 : newAttempts, 
            lockUntil: lockUntilDate
          }
        });

        if (isThirdAttempt) {
          return reply.status(403).send({
            message: `Sua conta foi bloqueada por ${LOCK_TIME_MINUTES} minutos devido a 3 tentativas incorretas.`
          });
        }

        return reply.status(401).send({ message: 'E-mail ou senha incorretos.' });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: 0,
          lockUntil: null
        }
      });

      const token = fastify.jwt.sign(
        { id: user.id, email: user.email },
        { expiresIn: '8h' }
      );

      return reply.send({
        message: 'Login realizado com sucesso',
        token,
        user: { id: user.id, name: user.name, email: user.email }
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: 'Erro interno no processo de login.' });
    }
  });
};