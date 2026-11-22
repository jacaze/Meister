// Base da API. Com VITE_API_URL (ex.: https://meister-api.onrender.com) o navegador chama a API
// direto (exige CORS_ORIGINS na API); sem ela, usa /api (proxy do Vite no dev, Caddy no compose).
// import.meta.env só existe sob o Vite; fora dele (node --test) cai no caminho relativo.
export function resolveApiBase(env?: { VITE_API_URL?: string }): string {
  const raw = (env?.VITE_API_URL ?? '').trim();
  const origin = raw.replace(/\/+$/, '').replace(/\/api$/i, '').replace(/\/+$/, '');
  return origin ? `${origin}/api` : '/api';
}

export const API_BASE_URL = resolveApiBase(
  (import.meta as { env?: { VITE_API_URL?: string } }).env,
);
