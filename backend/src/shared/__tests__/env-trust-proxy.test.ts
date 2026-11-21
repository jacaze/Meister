import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env.js';

const base = {
  DATABASE_URL: 'postgresql://user:real_strong_pwd@localhost:5432/db',
  JWT_SECRET: 'a_very_strong_random_secret_with_more_than_32_chars',
};

describe('Env — TRUST_PROXY', () => {
  it('ausente ou vazia desliga a confiança no proxy', () => {
    expect(parseEnv(base).TRUST_PROXY).toEqual([]);
    expect(parseEnv({ ...base, TRUST_PROXY: '' }).TRUST_PROXY).toEqual([]);
  });

  it('aceita lista de IPs, CIDRs e nomes do proxy-addr', () => {
    expect(parseEnv({ ...base, TRUST_PROXY: ' uniquelocal, 10.0.0.0/8 ,::1 ' }).TRUST_PROXY).toEqual([
      'uniquelocal',
      '10.0.0.0/8',
      '::1',
    ]);
  });

  it('recusa número de saltos, que o Fastify ignora', () => {
    expect(() => parseEnv({ ...base, TRUST_PROXY: '1' })).toThrow(/TRUST_PROXY/);
  });

  it('recusa valor que não é IP, CIDR nem nome conhecido', () => {
    expect(() => parseEnv({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(() => parseEnv({ ...base, TRUST_PROXY: 'caddy' })).toThrow(/TRUST_PROXY/);
  });
});
