// Flags de funcionalidade resolvidas no build (Vite). Padrão: desligadas.
// VITE_FEATURE_FAMILIA=true liga os perfis "Família" no onboarding (função ainda em construção).

export interface FeatureFlagsEnvInput {
  readonly DEV?: boolean;
  readonly VITE_FEATURE_FAMILIA?: string;
}

export interface FeatureFlags {
  readonly familia: boolean;
}

export function resolveFeatureFlags(env: FeatureFlagsEnvInput | undefined): FeatureFlags {
  return { familia: env?.VITE_FEATURE_FAMILIA === 'true' };
}

const FAMILY_PROFILES: readonly string[] = ['familia', 'familia_negocio'];

/** Sem a flag, esconde os perfis de família da lista de escolha. */
export function visibleProfiles<T extends { readonly value: string }>(profiles: readonly T[], familia: boolean): T[] {
  return profiles.filter((p) => familia || !FAMILY_PROFILES.includes(p.value));
}

// import.meta.env só existe sob o Vite; fora dele (node --test) cai no padrão desligado.
const viteEnv = (import.meta as { env?: FeatureFlagsEnvInput }).env;

export const featureFlags: FeatureFlags = resolveFeatureFlags(viteEnv);
