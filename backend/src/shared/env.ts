import { z } from 'zod';

const FORBIDDEN_DEFAULT_SECRETS = new Set([
  'sua_chave_secreta_super_segura',
  'substitua_por_uma_chave_aleatoria_com_pelo_menos_32_caracteres',
  'changeme',
  'secret',
]);

function isWeakSecret(val: string): boolean {
  const lower = val.toLowerCase().trim();
  return (
    lower.startsWith('dev_only') ||
    lower.startsWith('changeme') ||
    lower.includes('change_me') ||
    lower.startsWith('test_only') ||
    FORBIDDEN_DEFAULT_SECRETS.has(lower)
  );
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    APP_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173,http://127.0.0.1:5173')
      .transform((s) =>
        s
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      ),
    DEFAULT_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres')
      .refine(
        (val) => !FORBIDDEN_DEFAULT_SECRETS.has(val.trim()),
        'JWT_SECRET não pode usar o valor padrão de exemplo'
      ),
    JWT_ACCESS_TTL: z.string().default('8h'),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    LOCK_TIME_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    LOGIN_MAX_ATTEMPTS_PAIR: z.coerce.number().int().min(1).max(20).default(3),
    LOGIN_MAX_ATTEMPTS_ACCOUNT: z.coerce.number().int().min(3).max(100).default(10),
    LOGIN_MAX_ATTEMPTS_IP: z.coerce.number().int().min(5).max(500).default(30),
    REQUIRE_EMAIL_VERIFICATION: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    MEI_ANNUAL_LIMIT: z.coerce.number().positive().default(81000),
    TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
    TELEGRAM_BOT_USERNAME: z.string().optional().default('meister_financas_bot'),
    TELEGRAM_MODE: z.enum(['polling', 'webhook']).default('polling'),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(''),
    GEMINI_API_KEY: z.string().optional().default(''),
    LLM_MODEL: z.string().default('gemini-2.5-flash'),
    NARRATION_MODE: z.enum(['template', 'auto', 'llm']).default('auto'),
    PLUGGY_CLIENT_ID: z.string().optional().default(''),
    PLUGGY_CLIENT_SECRET: z.string().optional().default(''),
    PLUGGY_WEBHOOK_SECRET: z.string().optional().default(''),
    INTERNAL_TICK_SECRET: z.string().optional().default(''),
    DEMO_MODE: z
      .string()
      .optional()
      .default('true')
      .transform((v) => v !== 'false'),
  })
  .superRefine((data, ctx) => {
    const isDevOrTest = data.NODE_ENV === 'development' || data.NODE_ENV === 'test';

    // Em produção e staging, segredos não podem usar prefixos de desenvolvimento/teste ou senhas padrão
    if (!isDevOrTest) {
      if (isWeakSecret(data.JWT_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message:
            'JWT_SECRET não pode usar valor padrão ou prefixo dev_only/changeme em ambiente de produção/staging',
        });
      }

      if (data.INTERNAL_TICK_SECRET) {
        if (data.INTERNAL_TICK_SECRET.length < 32 || isWeakSecret(data.INTERNAL_TICK_SECRET)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['INTERNAL_TICK_SECRET'],
            message:
              'INTERNAL_TICK_SECRET deve ter pelo menos 32 caracteres e não pode usar valor padrão em produção/staging',
          });
        }
      }

      if (isWeakSecret(data.DATABASE_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'DATABASE_URL não pode conter senhas padrão como change_me ou dev_only em produção/staging',
        });
      }

      if (data.TELEGRAM_BOT_TOKEN && data.TELEGRAM_MODE === 'webhook') {
        if (!data.TELEGRAM_WEBHOOK_SECRET || data.TELEGRAM_WEBHOOK_SECRET.trim().length < 16) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['TELEGRAM_WEBHOOK_SECRET'],
            message:
              'TELEGRAM_WEBHOOK_SECRET é obrigatório (mínimo 16 caracteres) quando o bot do Telegram opera em modo webhook',
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, string | undefined> = process.env): AppEnv {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração de ambiente inválida: ${messages}`);
  }
  return result.data;
}
