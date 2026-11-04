import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const NGROK_DOMAIN = process.env.NGROK_DOMAIN || 'reprimand-fancy-contents.ngrok-free.dev';

if (!BOT_TOKEN) {
  console.error('❌ Erro: TELEGRAM_BOT_TOKEN não configurado no backend/.env');
  process.exit(1);
}

const action = process.argv[2] || 'set';
const customUrl = process.argv[3];

async function main() {
  const telegramApi = `https://api.telegram.org/bot${BOT_TOKEN}`;

  if (action === 'info') {
    const res = await fetch(`${telegramApi}/getWebhookInfo`);
    const data = await res.json();
    console.log('📡 Status Atual do Webhook Telegram:');
    console.dir(data, { depth: null });
    return;
  }

  if (action === 'delete') {
    const res = await fetch(`${telegramApi}/deleteWebhook`);
    const data = await res.json();
    console.log('🗑️ Webhook removido:');
    console.dir(data, { depth: null });
    return;
  }

  if (action === 'set') {
    const baseUrl = customUrl
      ? customUrl.replace(/\/$/, '')
      : `https://${NGROK_DOMAIN}`.replace(/\/$/, '');

    const webhookUrl = `${baseUrl}/telegram/webhook`;

    console.log(`⚙️ Registrando webhook no Telegram:`);
    console.log(`   URL: ${webhookUrl}`);
    console.log(`   Secret Token configurado: ${WEBHOOK_SECRET ? 'Sim (ativo)' : 'Não'}`);

    const payload: Record<string, unknown> = {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
    };

    if (WEBHOOK_SECRET) {
      payload.secret_token = WEBHOOK_SECRET;
    }

    const res = await fetch(`${telegramApi}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (data.ok) {
      console.log('✅ Webhook configurado com SUCESSO no Telegram!');
      console.log(`   Resposta: ${data.description}`);
    } else {
      console.error('❌ Falha ao configurar webhook no Telegram:');
      console.dir(data, { depth: null });
    }
  }
}

main().catch((err) => {
  console.error('Erro ao executar gerenciamento de webhook:', err);
  process.exit(1);
});
