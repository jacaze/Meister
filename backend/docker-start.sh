#!/bin/sh
# Start da API no Render (plano free não tem preDeployCommand): aplica as migrations
# pendentes (idempotente) e sobe a API. Script em vez de `sh -c "..."` porque o Render
# repassa as aspas do dockerCommand literalmente.
set -e
node_modules/.bin/prisma migrate deploy
exec node dist/main-api.js
