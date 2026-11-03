import 'dotenv/config';
import { buildApp } from './app.js';
import { parseEnv } from './shared/index.js';

async function start() {
  const env = parseEnv(process.env);
  const app = await buildApp({ env });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`MEIster API rodando em http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
