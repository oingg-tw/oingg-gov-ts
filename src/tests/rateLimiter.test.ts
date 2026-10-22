import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'ultimate-express';
import { ingestRateLimit } from '@/shared/rateLimiter';

// ingestRateLimit 用模組層級的 Map/Set 記狀態，測試之間不會自動重置——每個 test 用不同的
// originalUrl 當 key，彼此獨立，不用互相清理。

const buildReq = (originalUrl: string): Request => ({ originalUrl }) as unknown as Request;

const buildRes = () => {
  let finishCallback: (() => void) | undefined;
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    on(event: string, cb: () => void) {
      if (event === 'finish') finishCallback = cb;
      return res;
    },
    triggerFinish() {
      finishCallback?.();
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    triggerFinish: () => void;
  };
};

describe('ingestRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request through', () => {
    const req = buildReq('/api/ingest/test-allow-first');
    const res = buildRes();
    let nextCalled = false;

    ingestRateLimit(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('blocks a second concurrent request to the same path with 429 while the first is still in flight', () => {
    const url = '/api/ingest/test-concurrent';
    const first = buildRes();
    ingestRateLimit(buildReq(url), first, () => {}); // 第一個請求還沒 triggerFinish，視為still in flight

    const second = buildRes();
    let secondNextCalled = false;
    ingestRateLimit(buildReq(url), second, () => {
      secondNextCalled = true;
    });

    expect(second.statusCode).toBe(429);
    expect(secondNextCalled).toBe(false);
  });

  it('does not block a concurrent request to a different path (per-path isolation)', () => {
    const first = buildRes();
    ingestRateLimit(buildReq('/api/ingest/path-a'), first, () => {});

    const second = buildRes();
    let secondNextCalled = false;
    ingestRateLimit(buildReq('/api/ingest/path-b'), second, () => {
      secondNextCalled = true;
    });

    expect(secondNextCalled).toBe(true);
  });

  it('blocks a request within the 60s cooldown after the previous one finished', () => {
    const url = '/api/ingest/test-cooldown';
    const first = buildRes();
    ingestRateLimit(buildReq(url), first, () => {});
    first.triggerFinish(); // 第一個請求完成

    const second = buildRes();
    let secondNextCalled = false;
    ingestRateLimit(buildReq(url), second, () => {
      secondNextCalled = true;
    });

    expect(second.statusCode).toBe(429);
    expect(secondNextCalled).toBe(false);
    expect(second.headers['Retry-After']).toBeDefined();
  });

  it('does not start the cooldown after a failed request, and logs the failure body', () => {
    const url = '/api/ingest/test-failed-no-cooldown';
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    const first = buildRes();
    ingestRateLimit(buildReq(url), first, () => {});
    first.status(502).json({ error: 'FRED CSV 下載失敗：HTTP 503' });
    first.triggerFinish();
    spy.mockRestore();

    let secondNextCalled = false;
    ingestRateLimit(buildReq(url), buildRes(), () => {
      secondNextCalled = true;
    });

    expect(secondNextCalled).toBe(true);
    expect(errors.join()).toMatch(/HTTP 502.*FRED CSV 下載失敗/);
  });

  it('allows a request again once the 60s cooldown has elapsed', () => {
    const url = '/api/ingest/test-cooldown-elapsed';
    const first = buildRes();
    ingestRateLimit(buildReq(url), first, () => {});
    first.triggerFinish();

    vi.advanceTimersByTime(60_001);

    const second = buildRes();
    let secondNextCalled = false;
    ingestRateLimit(buildReq(url), second, () => {
      secondNextCalled = true;
    });

    expect(secondNextCalled).toBe(true);
  });
});
