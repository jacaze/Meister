# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public/
COPY src ./src/
# Variável de build (embutida no bundle): liga o banco de testes da Pluggy na demo hospedada
ARG VITE_PLUGGY_INCLUDE_SANDBOX=false
ENV VITE_PLUGGY_INCLUDE_SANDBOX=$VITE_PLUGGY_INCLUDE_SANDBOX
# Variável de build: mostra os perfis "Família" no onboarding (função em construção; padrão desligado)
ARG VITE_FEATURE_FAMILIA=false
ENV VITE_FEATURE_FAMILIA=$VITE_FEATURE_FAMILIA
RUN npm run build

FROM caddy:2.11-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/index.html > /dev/null || exit 1
