import fs from 'node:fs';
import path from 'node:path';
import type { BankingAggregator } from '../ports/BankingAggregator.js';
import { PluggyClient } from '../../infra/PluggyClient.js';
import { ValidationError } from '../../../../shared/index.js';

export interface PluggyConfigStatus {
  readonly hasCredentials: boolean;
  readonly clientIdMasked: string | null;
}

export interface SavePluggyConfigInput {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly aggregator?: BankingAggregator;
}

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
    console.warn('[ConfigurePluggy] Failed to write to .env:', err);
  }
}

export function getPluggyConfig(): PluggyConfigStatus {
  const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
  const hasCredentials = Boolean(clientId && clientSecret);

  let clientIdMasked: string | null = null;
  if (clientId && clientId.length > 8) {
    clientIdMasked = `${clientId.slice(0, 4)}...${clientId.slice(-4)}`;
  } else if (clientId) {
    clientIdMasked = 'Configurado';
  }

  return {
    hasCredentials,
    clientIdMasked,
  };
}

export async function savePluggyConfig(input: SavePluggyConfigInput): Promise<PluggyConfigStatus> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();

  if (!clientId || !clientSecret) {
    // Clear credentials
    delete process.env.PLUGGY_CLIENT_ID;
    delete process.env.PLUGGY_CLIENT_SECRET;
    updateEnvFile('PLUGGY_CLIENT_ID', null);
    updateEnvFile('PLUGGY_CLIENT_SECRET', null);
    return { hasCredentials: false, clientIdMasked: null };
  }

  // Validate credentials against Pluggy API
  const client =
    input.aggregator ||
    new PluggyClient({
      clientId,
      clientSecret,
    });

  const check = await client.validateCredentials();
  if (!check.valid) {
    throw new ValidationError(`Credenciais do Pluggy rejeitadas: ${check.error || 'Autenticação falhou'}`);
  }

  // Persist
  process.env.PLUGGY_CLIENT_ID = clientId;
  process.env.PLUGGY_CLIENT_SECRET = clientSecret;
  updateEnvFile('PLUGGY_CLIENT_ID', clientId);
  updateEnvFile('PLUGGY_CLIENT_SECRET', clientSecret);

  return {
    hasCredentials: true,
    clientIdMasked: `${clientId.slice(0, 4)}...${clientId.slice(-4)}`,
  };
}
