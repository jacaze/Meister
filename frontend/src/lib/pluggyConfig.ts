// Configuração de build da integração Pluggy no frontend.
// O sandbox (banco de testes "Pluggy Bank") fica ligado em desenvolvimento e,
// em produção, só quando VITE_PLUGGY_INCLUDE_SANDBOX=true for passado no build
// (demo hospedada). Qualquer outro valor mantém desligado.

export interface PluggyEnvInput {
  readonly DEV?: boolean;
  readonly VITE_PLUGGY_INCLUDE_SANDBOX?: string;
}

export interface PluggyConfig {
  readonly includeSandbox: boolean;
  readonly showDemoNotice: boolean;
}

export function resolvePluggyConfig(env: PluggyEnvInput | undefined): PluggyConfig {
  const includeSandbox = env?.DEV === true || env?.VITE_PLUGGY_INCLUDE_SANDBOX === 'true';
  return { includeSandbox, showDemoNotice: includeSandbox };
}

// import.meta.env só existe sob o Vite; fora dele (node --test) cai no padrão desligado.
const viteEnv = (import.meta as { env?: PluggyEnvInput }).env;

export const pluggyConfig: PluggyConfig = resolvePluggyConfig(viteEnv);
