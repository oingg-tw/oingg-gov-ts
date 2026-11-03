import { describe, it, expect, afterEach } from 'vitest';
import type { Request, Response } from 'ultimate-express';
import { requireTaskSecret } from '@/shared/middleware';

const ORIGINAL_TASK_SECRET = process.env.TASK_SECRET;

const buildReq = (opts: { header?: string; query?: string } = {}): Request => {
  return {
    headers: opts.header !== undefined ? { 'x-task-secret': opts.header } : {},
    query: opts.query !== undefined ? { task_secret: opts.query } : {},
  } as unknown as Request;
};

const buildRes = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
};

describe('requireTaskSecret', () => {
  afterEach(() => {
    if (ORIGINAL_TASK_SECRET === undefined) delete process.env.TASK_SECRET;
    else process.env.TASK_SECRET = ORIGINAL_TASK_SECRET;
  });

  it('fails closed with 500 when TASK_SECRET is not configured', () => {
    delete process.env.TASK_SECRET;
    const req = buildReq({ header: 'anything' });
    const res = buildRes();
    let nextCalled = false;

    requireTaskSecret(req, res, () => {
      nextCalled = true;
    });

    expect(res.statusCode).toBe(500);
    expect(nextCalled).toBe(false);
  });

  it('rejects with 401 when no secret is provided', () => {
    process.env.TASK_SECRET = 'correct-secret';
    const req = buildReq();
    const res = buildRes();
    let nextCalled = false;

    requireTaskSecret(req, res, () => {
      nextCalled = true;
    });

    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('rejects with 401 when the header secret is wrong', () => {
    process.env.TASK_SECRET = 'correct-secret';
    const req = buildReq({ header: 'wrong-secret' });
    const res = buildRes();
    let nextCalled = false;

    requireTaskSecret(req, res, () => {
      nextCalled = true;
    });

    expect(res.statusCode).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('accepts a matching secret via the x-task-secret header', () => {
    process.env.TASK_SECRET = 'correct-secret';
    const req = buildReq({ header: 'correct-secret' });
    const res = buildRes();
    let nextCalled = false;

    requireTaskSecret(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('rejects a secret passed as the task_secret query parameter (header only)', () => {
    process.env.TASK_SECRET = 'correct-secret';
    const req = buildReq({ query: 'correct-secret' });
    const res = buildRes();
    let nextCalled = false;

    requireTaskSecret(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it.each(['"correct-secret"', 'correct-secret\r', 'correct-secret\n', ' correct-secret', 'correct\nsecret'])(
    'fails closed with 500 instead of cleaning up a dirty TASK_SECRET (%j)',
    (dirty) => {
      process.env.TASK_SECRET = dirty;
      const req = buildReq({ header: 'correct-secret' });
      const res = buildRes();
      let nextCalled = false;
      const errors: string[] = [];
      const originalError = console.error;
      console.error = (msg: string) => errors.push(msg);

      try {
        requireTaskSecret(req, res, () => {
          nextCalled = true;
        });
      } finally {
        console.error = originalError;
      }

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(500);
      expect(errors.join('\n')).toContain('TASK_SECRET');
    }
  );

  it('rejects a secret of a different length without throwing (timingSafeEqual requires equal-length buffers)', () => {
    process.env.TASK_SECRET = 'correct-secret';
    const req = buildReq({ header: 'short' });
    const res = buildRes();

    expect(() => requireTaskSecret(req, res, () => {})).not.toThrow();
    expect(res.statusCode).toBe(401);
  });
});
