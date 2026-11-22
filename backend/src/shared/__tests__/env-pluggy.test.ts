import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.js';

// Tarefa 05: configuração da Pluggy validada no boot fora de development/test.
const base = {
  DATABASE_URL: 'postgresql://user:real_strong_pwd@localhost:5432/db',
  JWT_SECRET: 'a_very_strong_random_secret_with_more_than_32_chars',
};
const prod = { ...base, NODE_ENV: 'production' };

describe('Env — Pluggy', () => {
  it('em produção recusa PLUGGY_CLIENT_ID sem PLUGGY_CLIENT_SECRET', () => {
    expect(() => parseEnv({ ...prod, PLUGGY_CLIENT_ID: 'client-id', PLUGGY_CLIENT_SECRET: '' })).toThrow(
      /PLUGGY_CLIENT_SECRET/
    );
  });

  it('em produção recusa PLUGGY_CLIENT_SECRET sem PLUGGY_CLIENT_ID', () => {
    expect(() => parseEnv({ ...prod, PLUGGY_CLIENT_ID: '  ', PLUGGY_CLIENT_SECRET: 'client-secret' })).toThrow(
      /PLUGGY_CLIENT_ID/
    );
  });

  it('em produção trata PLUGGY_CLIENT_SECRET só com espaços como ausente', () => {
    expect(() => parseEnv({ ...prod, PLUGGY_CLIENT_ID: 'client-id', PLUGGY_CLIENT_SECRET: '   ' })).toThrow(
      /PLUGGY_CLIENT_SECRET/
    );
  });

  it('em staging também recusa credencial pela metade', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'staging', PLUGGY_CLIENT_ID: 'client-id' })).toThrow(
      /PLUGGY_CLIENT_SECRET/
    );
  });

  it('em produção aceita as duas credenciais ou nenhuma', () => {
    expect(() => parseEnv({ ...prod, PLUGGY_CLIENT_ID: 'client-id', PLUGGY_CLIENT_SECRET: 'client-secret' })).not.toThrow();
    expect(() => parseEnv(prod)).not.toThrow();
  });

  it('em desenvolvimento não exige o par completo', () => {
    expect(() => parseEnv({ ...base, PLUGGY_CLIENT_ID: 'client-id' })).not.toThrow();
  });

  it('em produção recusa PLUGGY_BASE_URL sem https', () => {
    expect(() => parseEnv({ ...prod, PLUGGY_BASE_URL: 'http://api.pluggy.ai' })).toThrow(/PLUGGY_BASE_URL.*https/);
  });

  it('em desenvolvimento aceita PLUGGY_BASE_URL http (servidor simulado)', () => {
    expect(parseEnv({ ...base, PLUGGY_BASE_URL: 'http://localhost:4010' }).PLUGGY_BASE_URL).toBe(
      'http://localhost:4010'
    );
  });

  it('recusa PLUGGY_BASE_URL que não é URL', () => {
    expect(() => parseEnv({ ...base, PLUGGY_BASE_URL: 'api.pluggy.ai' })).toThrow(/PLUGGY_BASE_URL/);
  });

  it('PLUGGY_BASE_URL vazia (docker compose com ${VAR:-}) conta como ausente', () => {
    expect(parseEnv({ ...prod, PLUGGY_BASE_URL: '' }).PLUGGY_BASE_URL).toBeUndefined();
  });

  it('PLUGGY_WEBHOOK_SECRET em produção/staging: aceita vazio/espaços ou forte (>= 32 chars e whsec_), recusa curto ou fraco', () => {
    expect(parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: '' }).PLUGGY_WEBHOOK_SECRET).toBe('');
    expect(parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: '   ' }).PLUGGY_WEBHOOK_SECRET).toBe('   ');

    expect(() => parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: 'a'.repeat(31) })).toThrow(
      /PLUGGY_WEBHOOK_SECRET/
    );
    expect(() =>
      parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: '   abc123   ' })
    ).toThrow(/PLUGGY_WEBHOOK_SECRET/);
    expect(() =>
      parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: 'changeme_secret_value_with_more_than_32_chars' })
    ).toThrow(/PLUGGY_WEBHOOK_SECRET/);
    expect(() =>
      parseEnv({ ...prod, NODE_ENV: 'staging', PLUGGY_WEBHOOK_SECRET: 'dev_only_secret_with_more_than_32_characters' })
    ).toThrow(/PLUGGY_WEBHOOK_SECRET/);

    const strongStatic = 'pluggy_webhook_prod_secret_with_32_plus_chars';
    expect(parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: strongStatic }).PLUGGY_WEBHOOK_SECRET).toBe(
      strongStatic
    );
    // Test threshold exactly 32 chars
    const exact32 = 'a'.repeat(32);
    expect(parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: exact32 }).PLUGGY_WEBHOOK_SECRET).toBe(exact32);

    const whsec = `whsec_${'a1b2c3d4'.repeat(8)}`;
    expect(parseEnv({ ...prod, PLUGGY_WEBHOOK_SECRET: whsec }).PLUGGY_WEBHOOK_SECRET).toBe(whsec);

    // Em desenvolvimento e teste aceita segredo curto
    expect(parseEnv({ ...base, PLUGGY_WEBHOOK_SECRET: 'curto' }).PLUGGY_WEBHOOK_SECRET).toBe('curto');
  });
});
