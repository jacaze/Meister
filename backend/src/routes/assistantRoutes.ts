import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  chatAssistant,
  proposeFromText,
  confirmProposal,
  cancelProposal,
} from '../modules/assistant/public.js';
import { parseReceiptPhoto } from '../modules/receipts/public.js';
import { ValidationError } from '../shared/index.js';

function updateEnvFile(key: string, value: string | null) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    let content = fs.readFileSync(envPath, 'utf8');
    const lineRegex = new RegExp(`^${key}=.*$`, 'm');

    if (value === null) {
      content = content.replace(lineRegex, '');
    } else if (lineRegex.test(content)) {
      content = content.replace(lineRegex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }

    fs.writeFileSync(envPath, content, 'utf8');
  } catch (err) {
    console.warn('[assistantRoutes] Unable to persist to .env:', err);
  }
}

export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Conversational Assistant Chat
  fastify.post('/assistant/chat', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body as {
      message?: unknown;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      throw new ValidationError('Mensagem é obrigatória.');
    }

    const outcome = await chatAssistant(scope, {
      message: body.message,
      history: Array.isArray(body.history) ? body.history : undefined,
    });

    return reply.status(200).send(outcome);
  });

  // Get Gemini / Assistant Configuration Status
  fastify.get('/assistant/config', async (_request, reply) => {
    const rawKey = process.env.GEMINI_API_KEY;
    const hasApiKey = Boolean(rawKey && rawKey.trim().length > 0);
    const maskedKey =
      hasApiKey && rawKey!.length > 8
        ? `${rawKey!.slice(0, 6)}...${rawKey!.slice(-4)}`
        : null;

    return reply.status(200).send({
      hasApiKey,
      maskedKey,
      model: process.env.LLM_MODEL || 'gemini-1.5-flash',
    });
  });

  // Save and Validate Gemini API Key
  fastify.post('/assistant/config', async (request, reply) => {
    const body = request.body as { apiKey?: unknown; model?: unknown };
    const rawKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : null;
    const selectedModel = typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : (process.env.LLM_MODEL || 'gemini-1.5-flash');

    if (!rawKey) {
      // Clear key if empty
      delete process.env.GEMINI_API_KEY;
      updateEnvFile('GEMINI_API_KEY', null);
      return reply.status(200).send({
        hasApiKey: false,
        message: 'Chave Gemini removida. O assistente usará o modo heurístico local.',
      });
    }

    // Ping Google Generative Language API to validate key
    try {
      const pingUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${rawKey}`;
      const pingRes = await fetch(pingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
        }),
      });

      if (!pingRes.ok) {
        const errorData = await pingRes.json().catch(() => null);
        const reason = errorData?.error?.message || pingRes.statusText;
        throw new ValidationError(`Chave rejeitada pela Google Gemini API: ${reason}`);
      }
    } catch (err: any) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(`Falha ao conectar à Google API: ${err.message || 'Verifique sua conexão'}`);
    }

    // Persist key and model
    process.env.GEMINI_API_KEY = rawKey;
    process.env.LLM_MODEL = selectedModel;
    updateEnvFile('GEMINI_API_KEY', rawKey);
    updateEnvFile('LLM_MODEL', selectedModel);

    return reply.status(200).send({
      hasApiKey: true,
      maskedKey: `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}`,
      model: selectedModel,
      message: 'Chave Gemini validada e ativada com sucesso!',
    });
  });

  // Scan Receipt Photo in Assistant
  fastify.post('/assistant/receipt', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body as {
      imageBase64?: unknown;
      mimeType?: unknown;
      textOrQrUrl?: unknown;
    };

    if (
      (!body.imageBase64 || typeof body.imageBase64 !== 'string') &&
      (!body.textOrQrUrl || typeof body.textOrQrUrl !== 'string')
    ) {
      throw new ValidationError('Imagem base64 ou URL do QR Code é obrigatória.');
    }

    const result = await parseReceiptPhoto(scope, {
      imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
      textOrQrUrl: typeof body.textOrQrUrl === 'string' ? body.textOrQrUrl : undefined,
      entityId: scope.defaultEntityIds.pj || scope.defaultEntityIds.pf,
    });

    return reply.status(200).send(result);
  });

  // Propose from natural language text
  fastify.post('/assistant/proposals', async (request, reply) => {
    const scope = request.scope!;
    const body = request.body as { text?: unknown };
    if (!body || typeof body.text !== 'string' || !body.text.trim()) {
      throw new ValidationError('Texto da mensagem é obrigatório.');
    }

    const outcome = await proposeFromText(scope, { text: body.text });
    return reply.status(200).send(outcome);
  });

  // Confirm proposal
  fastify.post('/assistant/proposals/:id/confirm', async (request, reply) => {
    const scope = request.scope!;
    const { id } = request.params as { id: string };

    const result = await confirmProposal(scope, id);
    return reply.status(200).send(result);
  });

  // Cancel proposal
  fastify.post('/assistant/proposals/:id/cancel', async (request, reply) => {
    const scope = request.scope!;
    const { id } = request.params as { id: string };

    const result = await cancelProposal(scope, id);
    return reply.status(200).send(result);
  });
}
