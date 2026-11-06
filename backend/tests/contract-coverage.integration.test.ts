import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Trava de cobertura da suíte de contrato: toda chamada de escrita do frontend
 * (api.post/put/patch/delete) precisa aparecer em contract-frontend-payloads.integration.test.ts.
 * Assim, uma tela nova que chama a API não fica sem teste do corpo real que ela envia.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const frontendSrc = path.resolve(here, '../../frontend/src');
const contractFile = path.resolve(here, 'contract-frontend-payloads.integration.test.ts');

type Call = { method: string; path: string; where: string };

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** "/api/x/${id}/y?z=1" → "/x/:p/y" */
function normalize(raw: string): string {
  return (
    raw
      .replace(/\?.*$/, '')
      .replace(/\$\{[^}]+\}/g, ':p')
      .replace(/^\/api(?=\/)/, '')
      .replace(/\/+$/, '') || '/'
  );
}

/** Rota com parâmetros vira regex: ":p" casa qualquer segmento (ex.: slug literal no teste). */
function toMatcher(route: string): RegExp {
  const escaped = route.split(':p').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('[^/]+')}$`);
}

function frontendWriteCalls(): Call[] {
  const calls: Call[] = [];
  const re = /api\.(post|put|patch|delete)\(\s*([`'])(.*?)\2/g;
  for (const file of listFiles(frontendSrc)) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(re)) {
      const line = source.slice(0, m.index).split('\n').length;
      calls.push({
        method: m[1]!.toUpperCase(),
        path: normalize(m[3]!),
        where: `${path.relative(frontendSrc, file)}:${line}`,
      });
    }
  }
  return calls;
}

function contractCalls(): Array<{ method: string; path: string }> {
  const source = readFileSync(contractFile, 'utf8');
  const re = /method:\s*'([A-Z]+)',\s*url:\s*([`'])(.*?)\2/g;
  return [...source.matchAll(re)].map((m) => ({ method: m[1]!, path: normalize(m[3]!) }));
}

describe('Cobertura da suíte de contrato', () => {
  it('encontra as chamadas de escrita do frontend (sanidade do leitor)', () => {
    // Se o padrão de chamada mudar (ex.: outro cliente HTTP), este número cai e a trava deixa de valer.
    expect(frontendWriteCalls().length).toBeGreaterThanOrEqual(30);
  });

  it('toda chamada de escrita do frontend tem caso na suíte de contrato', () => {
    const tested = contractCalls();
    const missing = frontendWriteCalls().filter((call) => {
      const matcher = toMatcher(call.path);
      return !tested.some((t) => t.method === call.method && (t.path === call.path || matcher.test(t.path)));
    });
    expect(
      missing.map((c) => `${c.method} ${c.path} (${c.where})`),
      'Chamadas do frontend sem caso em contract-frontend-payloads.integration.test.ts'
    ).toEqual([]);
  });
});
