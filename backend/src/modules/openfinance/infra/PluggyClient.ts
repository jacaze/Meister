import type {
  BankingAggregator,
  PluggyAccountInfo,
  PluggyItemInfo,
  PluggyTransactionInfo,
} from '../application/ports/BankingAggregator.js';
import { ValidationError } from '../../../shared/index.js';

interface AuthCache {
  apiKey: string;
  expiresAt: number; // Unix timestamp ms
}

export class PluggyClient implements BankingAggregator {
  private readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private authCache: AuthCache | null = null;
  private readonly timeoutMs: number;

  constructor(options?: {
    clientId?: string;
    clientSecret?: string;
    baseUrl?: string;
    timeoutMs?: number;
  }) {
    this.clientId = options?.clientId || process.env.PLUGGY_CLIENT_ID;
    this.clientSecret = options?.clientSecret || process.env.PLUGGY_CLIENT_SECRET;
    this.baseUrl = options?.baseUrl || process.env.PLUGGY_BASE_URL || 'https://api.pluggy.ai';
    this.timeoutMs = options?.timeoutMs || 15000;
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Timeout de comunicação com a API do Pluggy (${this.timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getApiKey(): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new ValidationError(
        'Credenciais do Pluggy não configuradas. Forneça o PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.'
      );
    }

    const now = Date.now();
    if (this.authCache && this.authCache.expiresAt > now + 60 * 1000) {
      return this.authCache.apiKey;
    }

    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.clientId,
          clientSecret: this.clientSecret,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        const detail = errorBody?.message || res.statusText;
        throw new ValidationError(`Falha de autenticação no Pluggy: ${detail} (status: ${res.status})`);
      }

      const data = await res.json();
      const apiKey = data.apiKey;
      if (!apiKey || typeof apiKey !== 'string') {
        throw new ValidationError('Resposta inválida do Pluggy ao autenticar: campo apiKey ausente.');
      }

      // Pluggy API keys are valid for 2 hours (7200s). We cache for 1h50min.
      this.authCache = {
        apiKey,
        expiresAt: now + 110 * 60 * 1000,
      };

      return apiKey;
    } catch (err: any) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(`Erro ao conectar ao Pluggy: ${err.message}`);
    }
  }

  async validateCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.getApiKey();
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  async createConnectToken(options?: { clientUserId?: string }): Promise<string> {
    const apiKey = await this.getApiKey();

    const body: Record<string, unknown> = {};
    if (options?.clientUserId) {
      body.clientUserId = options.clientUserId;
    }

    const res = await this.fetchWithTimeout(`${this.baseUrl}/connect_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ValidationError(
        `Erro ao gerar Connect Token no Pluggy: ${errorBody?.message || res.statusText}`
      );
    }

    const data = await res.json();
    if (!data.accessToken || typeof data.accessToken !== 'string') {
      throw new ValidationError('Connect Token ausente na resposta do Pluggy.');
    }

    return data.accessToken;
  }

  async fetchItem(itemId: string): Promise<PluggyItemInfo> {
    const apiKey = await this.getApiKey();

    const res = await this.fetchWithTimeout(`${this.baseUrl}/items/${itemId}`, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey },
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ValidationError(
        `Erro ao buscar Item no Pluggy (${itemId}): ${errorBody?.message || res.statusText}`
      );
    }

    const data = await res.json();
    return {
      id: data.id,
      status: data.status,
      executionStatus: data.executionStatus,
      connector: data.connector
        ? {
            id: data.connector.id,
            name: data.connector.name,
            primaryColor: data.connector.primaryColor,
            institutionUrl: data.connector.institutionUrl,
            imageUrl: data.connector.imageUrl,
          }
        : undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  async fetchAccounts(itemId: string): Promise<PluggyAccountInfo[]> {
    const apiKey = await this.getApiKey();

    const res = await this.fetchWithTimeout(`${this.baseUrl}/accounts?itemId=${itemId}`, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey },
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ValidationError(
        `Erro ao buscar contas no Pluggy: ${errorBody?.message || res.statusText}`
      );
    }

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    return results.map((acc: Record<string, any>) => ({
      id: String(acc.id),
      type: String(acc.type || 'BANK'),
      subtype: acc.subtype ? String(acc.subtype) : undefined,
      name: String(acc.name || 'Conta Bancária'),
      balance: typeof acc.balance === 'number' ? acc.balance : undefined,
      currencyCode: acc.currencyCode ? String(acc.currencyCode) : 'BRL',
      number: acc.number ? String(acc.number) : undefined,
    }));
  }

  async fetchTransactions(
    accountId: string,
    options?: { from?: string; to?: string }
  ): Promise<PluggyTransactionInfo[]> {
    const apiKey = await this.getApiKey();

    const params = new URLSearchParams();
    params.set('accountId', accountId);
    params.set('pageSize', '500');
    if (options?.from) params.set('from', options.from);
    if (options?.to) params.set('to', options.to);

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/transactions?${params.toString()}`,
      {
        method: 'GET',
        headers: { 'X-API-KEY': apiKey },
      }
    );

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ValidationError(
        `Erro ao buscar transações no Pluggy: ${errorBody?.message || res.statusText}`
      );
    }

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    return results.map((tx: Record<string, any>) => ({
      id: String(tx.id),
      description: String(tx.description || tx.descriptionRaw || 'Transação Bancária'),
      descriptionRaw: tx.descriptionRaw ? String(tx.descriptionRaw) : undefined,
      amount: typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount || 0)),
      date: String(tx.date || new Date().toISOString()),
      category: tx.category ? String(tx.category) : undefined,
      categoryId: tx.categoryId ? String(tx.categoryId) : undefined,
      type: tx.type ? String(tx.type) : undefined,
      status: tx.status ? String(tx.status) : undefined,
    }));
  }

  async syncItem(itemId: string): Promise<{ status: string }> {
    const apiKey = await this.getApiKey();

    const res = await this.fetchWithTimeout(`${this.baseUrl}/items/${itemId}/sync`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey },
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new ValidationError(
        `Erro ao solicitar sincronização no Pluggy: ${errorBody?.message || res.statusText}`
      );
    }

    const data = await res.json();
    return { status: String(data.status || 'UPDATING') };
  }
}
