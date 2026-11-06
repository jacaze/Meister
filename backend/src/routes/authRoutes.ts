import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../shared/index.js';
import { provisionWorkspace, resolveScopeForUser } from '../modules/workspace/public.js';
import { seedDefaultCategories } from '../modules/catalog/public.js';
import {
  registerUserSchema,
  loginUserSchema,
} from '../modules/workspace/application/schemas/auth-user-schemas.js';

// Precomputed bcrypt hash (cost 10) for constant-time comparison when user does not exist
const DUMMY_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export async function authRoutes(
  fastify: FastifyInstance,
  options: { lockTimeMinutes?: number } = {}
) {
  const lockTimeMinutes =
    typeof options.lockTimeMinutes === 'number' && options.lockTimeMinutes > 0
      ? options.lockTimeMinutes
      : Number(process.env.LOCK_TIME_MINUTES) || 15;

  fastify.post('/register', async (request, reply) => {
    const { name, email, password, accountType } = registerUserSchema.parse(request.body);

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existingUser) {
      throw new ConflictError('EMAIL_ALREADY_IN_USE', 'Este e-mail já está em uso.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: hashedPassword,
          accountType: accountType ?? 'pessoa_fisica',
        },
      });

      // Provision workspace, default entities and seed default categories
      const provision = await provisionWorkspace({
        userId: newUser.id,
        accountType: newUser.accountType,
        workspaceName: `Workspace de ${newUser.name}`,
      });

      await seedDefaultCategories({
        workspaceId: provision.workspaceId,
        userId: newUser.id,
        isMei: newUser.accountType === 'mei',
      });

      return reply.status(201).send({
        message: 'Usuário cadastrado com sucesso!',
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          accountType: newUser.accountType,
          workspaceId: provision.workspaceId,
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictError('EMAIL_ALREADY_IN_USE', 'Este e-mail já está em uso.');
      }
      throw err;
    }
  });

  fastify.post('/login', async (request, reply) => {
    const { email, password } = loginUserSchema.parse(request.body);

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (!user) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      throw new UnauthorizedError('E-mail ou senha incorretos.');
    }

    const now = new Date();
    if (user.lockUntil && user.lockUntil > now) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((new Date(user.lockUntil).getTime() - now.getTime()) / 60000)
      );
      throw new ForbiddenError(
        `Conta bloqueada temporariamente. Tente novamente em ${remainingMinutes} minuto(s).`,
        'ACCOUNT_LOCKED'
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // Atomic increment in database to prevent race condition on concurrent failed attempts
      const updatedRows = await prisma.$queryRaw<
        { failed_attempts: number; lock_until: Date | null }[]
      >`
        UPDATE "users"
        SET
          "failed_attempts" = CASE
            WHEN ("lock_until" IS NULL OR "lock_until" <= NOW()) AND "failed_attempts" + 1 >= 3 THEN 0
            ELSE "failed_attempts" + 1
          END,
          "lock_until" = CASE
            WHEN ("lock_until" IS NULL OR "lock_until" <= NOW()) AND "failed_attempts" + 1 >= 3
              THEN NOW() + (${lockTimeMinutes} * INTERVAL '1 minute')
            ELSE "lock_until"
          END
        WHERE "id" = ${user.id}
        RETURNING "failed_attempts", "lock_until"
      `;

      const updated = updatedRows[0];
      if (updated?.lock_until && updated.lock_until > now) {
        throw new ForbiddenError(
          `Sua conta foi bloqueada por ${lockTimeMinutes} minutos devido a 3 tentativas incorretas.`,
          'ACCOUNT_LOCKED'
        );
      }

      throw new UnauthorizedError('E-mail ou senha incorretos.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockUntil: null,
      },
    });

    const scope = await resolveScopeForUser(user.id);

    const token = fastify.jwt.sign(
      { sub: user.id, userId: user.id, email: user.email, wid: scope.workspaceId },
      { expiresIn: '8h' }
    );

    return reply.send({
      message: 'Login realizado com sucesso',
      token,
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        accountType: user.accountType,
        workspaceId: scope.workspaceId,
      },
    });
  });
}

export default authRoutes;
