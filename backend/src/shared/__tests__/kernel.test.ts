import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ConflictError,
  DomainError,
  ExternalServiceError,
  FakeClock,
  ForbiddenError,
  InProcessEventBus,
  LocalDate,
  MAX_MONEY_CENTS,
  Money,
  NotFoundError,
  RateLimitedError,
  SystemClock,
  UnauthorizedError,
  ValidationError,
  YearMonth,
  assertAuthenticated,
  assertCanWrite,
  assertOwner,
  constantTimeEquals,
  newId,
  newToken,
  normalizePageQuery,
  parseEnv,
  sha256Hex,
} from '../index.js';

describe('Shared Kernel — Money (unit & property-based)', () => {
  it('roundtrips decimal strings losslessly (Property 1)', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: MAX_MONEY_CENTS }), (cents) => {
        const m = Money.fromCents(cents);
        const formatted = m.toDecimalString();
        const parsed = Money.fromDecimalString(formatted);
        expect(parsed.equals(m)).toBe(true);
        expect(parsed.cents).toBe(cents);
      })
    );
  });

  it('satisfies commutativity, associativity, and inverse of add/sub (Property 2)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        (aCents, bCents, cCents) => {
          const a = Money.fromCents(aCents);
          const b = Money.fromCents(bCents);
          const c = Money.fromCents(cCents);

          expect(a.add(b).equals(b.add(a))).toBe(true);
          expect(a.add(b).add(c).equals(a.add(b.add(c)))).toBe(true);
          expect(a.add(b).sub(b).equals(a)).toBe(true);
        }
      )
    );
  });

  it('allocates by Largest Remainder Method with exact sum and <= 1 cent deviation (Property 3)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 100_000_000n }),
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1, maxLength: 10 }),
        (totalCents, weights) => {
          const total = Money.fromCents(totalCents);
          const shares = total.allocate(weights);
          expect(shares).toHaveLength(weights.length);

          const sumAllocated = Money.sum(shares);
          expect(sumAllocated.equals(total)).toBe(true);

          const weightSum = BigInt(weights.reduce((acc, w) => acc + w, 0));
          for (let i = 0; i < shares.length; i++) {
            const share = shares[i]!;
            expect(share.cents >= 0n).toBe(true);
            const floorQuota = (totalCents * BigInt(weights[i]!)) / weightSum;
            const diff = share.cents - floorQuota;
            expect(diff === 0n || diff === 1n).toBe(true);
          }
        }
      )
    );
  });

  it('breaks ties deterministically by lowest index in allocate()', () => {
    const oneReal = Money.fromDecimalString('1.00');
    const shares = oneReal.allocate([3333, 3333, 3334]);
    expect(shares.map((s) => s.toDecimalString())).toEqual(['0.33', '0.33', '0.34']);

    const equalWeights = oneReal.allocate([1, 1, 1]);
    expect(equalWeights.map((s) => s.toDecimalString())).toEqual(['0.34', '0.33', '0.33']);
  });

  it('rejects malformed, scientific, >2 decimals, negative, or oversized inputs (Property 4 & 5)', () => {
    const invalidInputs = [
      '',
      '   ',
      '12',
      '85.999',
      '1e3',
      '1E2',
      '1,5.0',
      '-1',
      '-0.01',
      ' 12.00',
      '12.00 ',
      'abc',
      '10000000000.00',
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      {},
    ];

    // Note: '12' is valid for fromDecimalString, let's check the rest
    for (const bad of invalidInputs.filter((x) => x !== '12')) {
      expect(() => Money.fromInput(bad, { requirePositive: true })).toThrow(ValidationError);
    }

    expect(() => Money.fromInput(0, { requirePositive: true })).toThrow(ValidationError);
    expect(() => Money.fromInput('0.00', { requirePositive: true })).toThrow(ValidationError);
    expect(() => Money.fromInput(12.345)).toThrow(ValidationError);
    expect(() => Money.fromCents(-1n)).toThrow(ValidationError);
    expect(() => Money.fromCents(MAX_MONEY_CENTS + 1n)).toThrow(ValidationError);
    expect(() => Money.fromCents(1.5)).toThrow(ValidationError);
  });

  it('supports comma only when allowComma is enabled', () => {
    expect(() => Money.fromDecimalString('85,90')).toThrow(ValidationError);
    const m = Money.fromDecimalString('85,90', { allowComma: true });
    expect(m.toDecimalString()).toBe('85.90');
    expect(m.toNumber()).toBe(85.9);
  });

  it('performs mulRatio with half-up rounding and validates ratio inputs', () => {
    const base = Money.fromDecimalString('100.00');
    expect(base.mulRatio(5, 100).toDecimalString()).toBe('5.00');

    const odd = Money.fromDecimalString('1621.00'); // Salário mínimo 2026
    expect(odd.mulRatio(5, 100).toDecimalString()).toBe('81.05'); // INSS 5%

    const half = Money.fromCents(1n);
    expect(half.mulRatio(1, 2).cents).toBe(1n); // 0.5 cent rounds up to 1 cent
    expect(half.mulRatio(1, 3).cents).toBe(0n); // 0.33 cent rounds down to 0

    expect(() => base.mulRatio(1, 0)).toThrow(ValidationError);
    expect(() => base.mulRatio(-1, 2)).toThrow(ValidationError);
  });

  it('handles sub, signedDiff, compare, isZero, isPositive, formatCents', () => {
    const a = Money.fromDecimalString('50.00');
    const b = Money.fromDecimalString('20.00');
    expect(a.sub(b).toDecimalString()).toBe('30.00');
    expect(() => b.sub(a)).toThrow(ValidationError);
    expect(b.signedDiff(a)).toBe(-3000n);
    expect(Money.formatCents(-3005n)).toBe('-30.05');
    expect(Money.centsToNumber(-3005n)).toBe(-30.05);
    expect(a.compare(b)).toBe(1);
    expect(b.compare(a)).toBe(-1);
    expect(a.compare(a)).toBe(0);
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.zero().isPositive()).toBe(false);
    expect(a.isPositive()).toBe(true);
  });
});

describe('Shared Kernel — LocalDate, YearMonth & Clock (America/Sao_Paulo)', () => {
  it('resolves instants at 23:30 BRT on the last day of the month to the current month, not next month (fixes A8)', () => {
    // 2026-10-31 23:30:00 in America/Sao_Paulo (UTC-3) is 2026-11-01T02:30:00.000Z in UTC!
    const instantUtc = new Date('2026-11-01T02:30:00.000Z');
    const clock = new FakeClock(instantUtc);

    const todayBr = clock.today('America/Sao_Paulo');
    expect(todayBr.toIsoDate()).toBe('2026-10-31');
    expect(clock.currentYearMonth('America/Sao_Paulo').toString()).toBe('2026-10');
  });

  it('validates leap years and calendar boundaries in LocalDate', () => {
    expect(() => LocalDate.fromIsoDate('2026-02-29')).toThrow(ValidationError);
    expect(LocalDate.fromIsoDate('2024-02-29').toIsoDate()).toBe('2024-02-29');
    expect(() => LocalDate.fromIsoDate('2026-13-01')).toThrow(ValidationError);
    expect(() => LocalDate.fromIsoDate('2026-00-10')).toThrow(ValidationError);
    expect(() => LocalDate.fromIsoDate('2026-04-31')).toThrow(ValidationError);
  });

  it('computes startOfMonth, endOfMonth, addMonths, and addDays accurately', () => {
    const ym = YearMonth.fromString('2026-02');
    expect(ym.startOfMonth().toIsoDate()).toBe('2026-02-01');
    expect(ym.endOfMonth().toIsoDate()).toBe('2026-02-28');
    expect(ym.addMonths(-1).toString()).toBe('2026-01');
    expect(ym.addMonths(-2).toString()).toBe('2025-12');

    const d1 = LocalDate.fromIsoDate('2026-10-31');
    expect(d1.addDays(1).toIsoDate()).toBe('2026-11-01');
    expect(d1.isAfter(LocalDate.fromIsoDate('2026-10-30'))).toBe(true);
    expect(d1.isBefore(LocalDate.fromIsoDate('2026-11-01'))).toBe(true);
    expect(d1.isWeekend()).toBe(true); // 2026-10-31 is Saturday
    expect(LocalDate.fromIsoDate('2026-11-02').isWeekend()).toBe(false); // Monday
  });

  it('advances FakeClock and reads SystemClock', () => {
    const fake = new FakeClock('2026-05-10T10:00:00.000Z');
    fake.advanceMinutes(30);
    expect(fake.now().toISOString()).toBe('2026-05-10T10:30:00.000Z');

    const sys = new SystemClock();
    expect(sys.now()).toBeInstanceOf(Date);
    expect(sys.today().year).toBeGreaterThanOrEqual(2024);
  });
});

describe('Shared Kernel — Ids, Env, Scope, Events, Pagination & Errors', () => {
  it('generates monotonic UUID v7 and base64url tokens', () => {
    const id1 = newId(1700000000000);
    const id2 = newId(1700000001000);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id1 < id2).toBe(true);

    const token = newToken(32);
    expect(token).toHaveLength(43);
    expect(sha256Hex('test')).toHaveLength(64);
    expect(constantTimeEquals('secret-123', 'secret-123')).toBe(true);
    expect(constantTimeEquals('secret-123', 'secret-124')).toBe(false);
    expect(constantTimeEquals('short', 'longer-string')).toBe(false);
  });

  it('validates Env strictly and refuses missing, short, or placeholder JWT_SECRET (fixes A3 & A5)', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'too_short',
      })
    ).toThrow(/JWT_SECRET/);

    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'sua_chave_secreta_super_segura',
      })
    ).toThrow(/JWT_SECRET/);

    const valid = parseEnv({
      DATABASE_URL: 'postgresql://localhost:5432/db',
      JWT_SECRET: 'a_very_strong_random_secret_with_more_than_32_chars',
    });
    expect(valid.LOCK_TIME_MINUTES).toBe(15);
    expect(valid.MEI_ANNUAL_LIMIT).toBe(81000);
  });

  it('enforces WorkspaceScope permissions', () => {
    expect(() => assertAuthenticated('')).toThrow(UnauthorizedError);
    const viewerScope = {
      workspaceId: 'w1',
      actorUserId: 'u1',
      role: 'viewer' as const,
      defaultEntityIds: { pf: 'e1' },
    };
    expect(() => assertCanWrite(viewerScope)).toThrow(ForbiddenError);
    expect(() => assertOwner(viewerScope)).toThrow(ForbiddenError);

    const ownerScope = { ...viewerScope, role: 'owner' as const };
    expect(() => assertCanWrite(ownerScope)).not.toThrow();
    expect(() => assertOwner(ownerScope)).not.toThrow();
  });

  it('isolates subscriber errors in InProcessEventBus', async () => {
    const errors: unknown[] = [];
    const bus = new InProcessEventBus({ onError: (err) => errors.push(err) });
    const received: string[] = [];

    bus.subscribe('tx.created', () => {
      throw new Error('subscriber 1 failed');
    });
    bus.subscribe<{ id: string }>('tx.created', (ev) => {
      received.push(ev.payload.id);
    });

    await bus.publish({
      name: 'tx.created',
      occurredAt: new Date(),
      payload: { id: 'tx-1' },
    });

    expect(errors).toHaveLength(1);
    expect(received).toEqual(['tx-1']);
  });

  it('normalizes pagination queries with safe defaults', () => {
    expect(normalizePageQuery({})).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(normalizePageQuery({ page: '-5', pageSize: '999' })).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
      take: 100,
    });
    expect(normalizePageQuery({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it('constructs all DomainError subclasses with proper HTTP status codes', () => {
    expect(new ValidationError('bad')).toBeInstanceOf(DomainError);
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError('DUP', 'conflict').statusCode).toBe(409);
    expect(new RateLimitedError('wait', 60).retryAfterSeconds).toBe(60);
    expect(new ExternalServiceError().statusCode).toBe(503);
  });
});
