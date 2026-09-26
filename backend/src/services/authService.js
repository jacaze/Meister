const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

async function register({ name, email, password, accountType }) {
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    const error = new Error('Já existe um usuário com esse e-mail');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      accountType: accountType || 'pessoa_fisica',
    },
  });

  return { id: user.id, name: user.name, email: user.email };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const error = new Error('E-mail ou senha inválidos');
    error.statusCode = 401;
    throw error;
  }

  const senhaValida = await bcrypt.compare(password, user.passwordHash);

  if (!senhaValida) {
    const error = new Error('E-mail ou senha inválidos');
    error.statusCode = 401;
    throw error;
  }

  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email },
  };
}

module.exports = { register, login };