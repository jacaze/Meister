# 13 — Confiar no proxy reverso (`TRUST_PROXY`)

**Prioridade:** 🔴 bloqueador de produção (achado na revisão da tarefa 03)
**Dono:** Backend
**Status:** FEITA

## Problema

Atrás do Caddy, todo pedido chega à API com o IP do container do proxy. O Fastify não tinha
`trustProxy`, então:

- o rate limit global (`backend/src/app.ts`, 300 req/min por `request.ip`) virava **um limite único
  para todos os usuários**: poucos usuários ativos já recebiam 429;
- o IP do consentimento LGPD (`backend/src/routes/complianceRoutes.ts`) era lido do
  `X-Forwarded-For` cru, que o cliente pode forjar.

## Como foi resolvido

- Variável nova `TRUST_PROXY`: lista de proxies confiáveis (IP, CIDR ou `loopback`/`linklocal`/`uniquelocal`),
  separados por vírgula. Vazia = não confia em `X-Forwarded-For` (padrão).
- **Número de saltos não é aceito:** no Fastify 5.12.8 do projeto, `trustProxy: 1` não muda o `request.ip`
  (testado com `inject` e com servidor HTTP real). O `env.ts` recusa número com mensagem clara.
- `app.ts` passa a lista ao Fastify; o consentimento usa `request.ip`.
- Testes: `backend/tests/trust-proxy.integration.test.ts` (rate limit separado por cliente atrás do proxy,
  `X-Forwarded-For` forjado não escapa do limite sem proxy, IP do consentimento) e
  `backend/src/shared/__tests__/env-trust-proxy.test.ts`.

## Para a tarefa 03 (DevOps)

No `docker-compose.prod.yml`, defina `TRUST_PROXY: uniquelocal` no serviço `api` (o Caddy fala com a API
pela rede privada do Docker). No compose base fica vazia, porque ali não há proxy.

## Achado sem correção

`LOGIN_MAX_ATTEMPTS_IP` é validada no `env.ts`, mas nenhum código a usa (não há limite de login por IP).
