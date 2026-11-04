import ngrok from '@ngrok/ngrok';
import dotenv from 'dotenv';
dotenv.config();

async function startTunnel() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const domain = process.env.NGROK_DOMAIN || 'reprimand-fancy-contents.ngrok-free.dev';
  const authtoken = process.env.NGROK_AUTHTOKEN;

  console.log(`[ngrok] Iniciando túnel para localhost:${port}...`);
  console.log(`[ngrok] Domínio configurado: ${domain}`);

  const options: Record<string, unknown> = {
    addr: `localhost:${port}`,
    domain,
  };

  if (authtoken) {
    options.authtoken = authtoken;
  } else {
    options.authtoken_from_env = true;
  }

  try {
    const forwarder = await ngrok.forward(options as any);
    console.log(`\n🚀 Túnel ngrok conectado com sucesso!`);
    console.log(`🔗 URL Pública: ${forwarder.url()}`);
    console.log(`🤖 Endpoint do Webhook: ${forwarder.url()}/telegram/webhook`);
    console.log(`\n(Mantenha este processo em execução enquanto estiver testando o bot no Telegram)`);
    console.log(`Pressione Ctrl+C para encerrar o túnel.`);

    // Keep process alive
    process.stdin.resume();
  } catch (err: any) {
    console.error('\n❌ Erro ao iniciar túnel ngrok:', err.message || err);
    if (String(err).includes('authtoken') || String(err).includes('ERR_NGROK_4018')) {
      console.log('\n💡 Dica: Forneça seu authtoken do ngrok executando:');
      console.log('   NGROK_AUTHTOKEN=seu_token npm run tunnel');
      console.log('   ou adicione NGROK_AUTHTOKEN no seu backend/.env');
    }
    process.exit(1);
  }
}

startTunnel();
