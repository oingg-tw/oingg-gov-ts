import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'ultimate-express';
import { currentRawObjects, keepUpstream, pickRunsToReplay, rawObjectName, runRawContext, type UpstreamResponse } from '@/shared/bronze';
import { bronzeRun } from '@/shared/bronzeRun';

// 銅層：每次抓到的回應先原樣存進 GCS 再解析，錯誤回應也存；帶 replayRunId 時改回放存過的檔。
const gcs = vi.hoisted(() => ({ putObjectIfAbsent: vi.fn(), getObject: vi.fn() }));
const db = vi.hoisted(() => ({ ingestionRun: { findUnique: vi.fn() } }));
vi.mock('@/adapters/gcs/client', () => gcs);
vi.mock('@/adapters/prisma/index', () => ({ default: db }));

const URL_ = 'https://www.sitca.org.tw/MemberK0000/F/03/nav.csv';
const response = (status: number, text: string): UpstreamResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'text/csv', 'last-modified': 'Tue, 11 Nov 2026 13:00:00 GMT' }),
  body: Buffer.from(text),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BRONZE_BUCKET = 'bronze-test';
});
afterEach(() => {
  delete process.env.BRONZE_BUCKET;
});

describe('bronze layer', () => {
  it('names objects by job, Taipei date and time, and content hash', () => {
    expect(rawObjectName('fund-daily-nav', new Date('2026-11-11T14:02:15Z'), 'abcdef0123456789', 'csv')).toBe('fund-daily-nav/2026-11-11/220215_abcdef012345.csv');
    // 台北 03:02 是 UTC 前一天，日期要照台北
    expect(rawObjectName('monthly-cpi', new Date('2026-11-10T19:02:00Z'), 'ffff', 'xml')).toBe('monthly-cpi/2026-11-11/030200_ffff.xml');
  });

  it('stores the response before returning it and records the object for ingestion_runs', async () => {
    const download = vi.fn(async () => response(200, 'csv'));
    const objects = await runRawContext('fund-daily-nav', undefined, async () => {
      const got = await keepUpstream(URL_, 'csv', download);
      expect(got.body.toString()).toBe('csv');
      return currentRawObjects();
    });
    expect(gcs.putObjectIfAbsent).toHaveBeenCalledTimes(1);
    const [bucket, path, body, contentType, metadata] = gcs.putObjectIfAbsent.mock.calls[0]!;
    expect([bucket, body.toString(), contentType]).toEqual(['bronze-test', 'csv', 'text/csv']);
    expect(path).toMatch(/^fund-daily-nav\/\d{4}-\d{2}-\d{2}\/\d{6}_[0-9a-f]{12}\.csv$/);
    expect(metadata).toMatchObject({ url: URL_, status: '200', 'last-modified': 'Tue, 11 Nov 2026 13:00:00 GMT' });
    expect(objects).toEqual([path]);
  });

  it('stores error responses too and leaves the decision to throw to the caller', async () => {
    const got = await runRawContext('fund-daily-nav', undefined, () => keepUpstream(URL_, 'csv', async () => response(503, 'busy')));
    expect(got.ok).toBe(false);
    expect(gcs.putObjectIfAbsent.mock.calls[0]![4]).toMatchObject({ status: '503' });
  });

  it('fails instead of handing back a response that could not be stored', async () => {
    gcs.putObjectIfAbsent.mockRejectedValueOnce(new Error('HTTP 403'));
    await expect(runRawContext('fund-daily-nav', undefined, () => keepUpstream(URL_, 'csv', async () => response(200, 'csv')))).rejects.toThrow('HTTP 403');
  });

  it('replays a stored response by URL without downloading', async () => {
    gcs.getObject.mockResolvedValue({ body: Buffer.from('kept'), contentType: 'text/csv', metadata: { url: URL_, status: '200', 'last-modified': 'Mon, 10 Nov 2026 13:00:00 GMT' } });
    const download = vi.fn();
    const [got, objects] = await runRawContext('fund-daily-nav', ['fund-daily-nav/2026-11-10/220200_aaa.csv'], async () => [await keepUpstream(URL_, 'csv', download), currentRawObjects()] as const);
    expect(download).not.toHaveBeenCalled();
    expect(gcs.putObjectIfAbsent).not.toHaveBeenCalled();
    expect([got.ok, got.body.toString(), got.headers.get('last-modified')]).toEqual([true, 'kept', 'Mon, 10 Nov 2026 13:00:00 GMT']);
    expect(objects).toEqual(['fund-daily-nav/2026-11-10/220200_aaa.csv']);
  });

  it('replays every run of a snapshot-window source but only the last run of the others', () => {
    expect(pickRunsToReplay('fund-daily-nav', [1, 2, 3])).toEqual([1, 2, 3]);
    expect(pickRunsToReplay('labor-broker-license', [1, 2, 3])).toEqual([3]);
  });

  it('refuses to replay a URL the run did not store', async () => {
    gcs.getObject.mockResolvedValue({ body: Buffer.from(''), contentType: 'text/csv', metadata: { url: 'https://example.com/other.csv', status: '200' } });
    await expect(runRawContext('fund-daily-nav', ['fund-daily-nav/2026-11-10/220200_aaa.csv'], () => keepUpstream(URL_, 'csv', vi.fn()))).rejects.toThrow('沒有存');
  });
});

describe('bronzeRun middleware', () => {
  const call = async (path: string, body: unknown) => {
    const res = { statusCode: 200, status: vi.fn((code: number) => ((res.statusCode = code), res)), json: vi.fn(() => res) };
    const next = vi.fn(() => currentRawObjects());
    await bronzeRun({ path, body } as unknown as Request, res as unknown as Response, next);
    return { res, next };
  };

  it('rejects replaying a run that belongs to another job', async () => {
    db.ingestionRun.findUnique.mockResolvedValue({ rawObjects: ['fund-basic-info/2026-11-10/032700_bbb.csv'] });
    const { res, next } = await call('/fund-daily-nav', { replayRunId: 5 });
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a replayRunId that is not a positive integer', async () => {
    const { res } = await call('/fund-daily-nav', { replayRunId: '5' });
    expect(res.statusCode).toBe(400);
    expect(db.ingestionRun.findUnique).not.toHaveBeenCalled();
  });
});
