import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import prisma from '../src/config/prisma.js';
import { handleTelegramUpdate } from '../src/modules/telegram/public.js';
import type { TelegramUpdate } from '../src/modules/telegram/public.js';

interface Sent {
  chatId: string;
  text: string;
}

function fakeChannel(sent: Sent[]) {
  return {
    async sendText(chatId: string, text: string) {
      sent.push({ chatId, text });
    },
    async editMessageText() {},
    async answerCallback() {},
  };
}

let seq = Math.floor(Math.random() * 1_000_000_000);
const nextId = () => ++seq;

describe('Telegram: mensagens sem texto nem foto tratável', () => {
  let app: FastifyInstance;
  const linkedChat = `chat_midia_${Date.now()}`;
  const unlinkedChat = `chat_midia_nl_${Date.now()}`;

  async function send(chatId: string, message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const sent: Sent[] = [];
    const update = {
      update_id: nextId(),
      message: { message_id: nextId(), from: { id: 777, is_bot: false }, chat: { id: chatId, type: 'private' }, ...message },
      ...extra,
    } as unknown as TelegramUpdate;
    await handleTelegramUpdate(update, fakeChannel(sent));
    return sent;
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
    const email = `tg_midia_${Date.now()}@test.com`;
    await app.inject({
      method: 'POST',
      url: '/api/register',
      payload: { name: 'Midia', email, password: 'Password123!', accountType: 'mei' },
    });
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: 'Password123!' } });
    const token = login.json().token as string;
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    const lt = await app.inject({
      method: 'POST',
      url: '/api/telegram/link-token',
      headers: { authorization: `Bearer ${token}` },
    });
    await send(linkedChat, { text: `/start ${lt.json().token}` });
    expect(await prisma.telegramLink.findFirst({ where: { chatId: linkedChat, status: 'ativo' } })).not.toBeNull();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('áudio recebe resposta específica', async () => {
    const sent = await send(linkedChat, { audio: { file_id: 'a1', duration: 3 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('Ainda não entendo áudio');
    expect(sent[0]!.text).toContain('gastei 45 no mercado no pix');
  });

  it('nota de voz recebe resposta específica', async () => {
    const sent = await send(linkedChat, { voice: { file_id: 'v1', duration: 3 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('Ainda não entendo áudio');
  });

  it('documento não-imagem pede foto ou texto', async () => {
    const sent = await send(linkedChat, { document: { file_id: 'd1', mime_type: 'application/pdf' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('documento');
    expect(sent[0]!.text).toContain('foto');
  });

  it('figurinha recebe mensagem genérica com o que o bot entende', async () => {
    const sent = await send(linkedChat, { sticker: { file_id: 's1' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('texto');
    expect(sent[0]!.text).toContain('foto');
  });

  it('vídeo e localização recebem mensagem genérica', async () => {
    const v = await send(linkedChat, { video: { file_id: 'vd1' } });
    const l = await send(linkedChat, { location: { latitude: 1, longitude: 2 } });
    expect(v).toHaveLength(1);
    expect(l).toHaveLength(1);
  });

  it('imagem enviada como arquivo entra no fluxo de foto', async () => {
    const sent: Sent[] = [];
    const channel = { ...fakeChannel(sent), downloadFile: async () => null };
    await handleTelegramUpdate(
      {
        update_id: nextId(),
        message: {
          message_id: nextId(),
          from: { id: 777, is_bot: false },
          chat: { id: linkedChat, type: 'private' },
          document: { file_id: 'img1', mime_type: 'image/png' },
        },
      } as unknown as TelegramUpdate,
      channel
    );
    expect(sent.map((s) => s.text).join('\n')).toContain('Não foi possível baixar a imagem');
  });

  it('chat não vinculado recebe apenas a mensagem de boas-vindas (sem vazar dados)', async () => {
    const sent = await send(unlinkedChat, { voice: { file_id: 'v2', duration: 1 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('Vincular');
    expect(sent[0]!.text).not.toContain('áudio');
  });

  it('mensagem editada recebe resposta no chat vinculado', async () => {
    const sent: Sent[] = [];
    await handleTelegramUpdate(
      {
        update_id: nextId(),
        edited_message: {
          message_id: 5,
          from: { id: 777, is_bot: false },
          chat: { id: linkedChat, type: 'private' },
          text: 'gastei 10',
        },
      } as unknown as TelegramUpdate,
      fakeChannel(sent)
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('editou');
  });

  it('callback de proposta expirada/inexistente responde ao usuário', async () => {
    const sent: Sent[] = [];
    await handleTelegramUpdate(
      {
        update_id: nextId(),
        callback_query: {
          id: 'cbx',
          from: { id: 777 },
          data: 'p:00000000-0000-0000-0000-000000000000:c',
          message: { message_id: 9, chat: { id: linkedChat } },
        },
      } as unknown as TelegramUpdate,
      fakeChannel(sent)
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('Proposta não encontrada');
  });

  it('update repetido (mesmo update_id) não responde duas vezes', async () => {
    const sent: Sent[] = [];
    const update = {
      update_id: nextId(),
      message: { message_id: 1, from: { id: 777, is_bot: false }, chat: { id: linkedChat, type: 'private' }, sticker: { file_id: 's' } },
    } as unknown as TelegramUpdate;
    await handleTelegramUpdate(update, fakeChannel(sent));
    await handleTelegramUpdate(update, fakeChannel(sent));
    expect(sent).toHaveLength(1);
  });
});
