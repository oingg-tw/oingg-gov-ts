import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'ultimate-express';
import { currentRawObjects, keepUpstream, rawObjectName, runRawContext, type UpstreamResponse } from '@/shared/bronze';
import { bronzeRun } from '@/shared/bronzeRun';
import { DATASET_BY_JOB, pickRunsToReplay } from '@/shared/ingestDatasets';
import { readFileSync } from 'node:fs';

// 銅層 v1：每次抓到的回應先原樣存進 GCS 再解析，錯誤回應也存；寫不進去不擋匯入、記 [bronze-write-failed]；
// 帶 replayRunId 時改回放存過的檔。
const gcs = vi.hoisted(() => ({ putObjectIfAbsent: vi.fn(), getObject: vi.fn() }));
const db = vi.hoisted(() => ({ ingestionRun: { findUnique: vi.fn() } }));
vi.mock('@/adapters/gcs/client', () => gcs);
vi.mock('@/adapters/prisma/index', () => ({ default: db }));

const NAV_URL = 'https://www.sitca.org.tw/MemberK0000/F/03/nav.csv';
const response = (status: number, text: string): UpstreamResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'text/csv', 'last-modified': 'Tue, 11 Nov 2026 13:00:00 GMT' }),
  body: Buffer.from(text),
});
const inRun = <T>(fn: () => Promise<T>, replayRefs?: string[]) => runRawContext('v_fund_daily_navs', replayRefs, async () => [await fn(), currentRawObjects()] as const);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BRONZE_BUCKET = 'bronze-test';
});
afterEach(() => {
  delete process.env.BRONZE_BUCKET;
});

describe('bronze layer', () => {
  it('names objects by host, endpoint path, Taipei date and time, and content hash', () => {
    expect(rawObjectName(NAV_URL, new Date('2026-11-11T14:02:15.123Z'), 'abcdef0123456789', 'csv')).toBe(
      'www.sitca.org.tw/MemberK0000/F/03/nav.csv/2026-11-11/220215123_abcdef012345.csv'
    );
    // 查詢參數不進路徑；台北 03:02 是 UTC 前一天，日期要照台北
    expect(rawObjectName('https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=EG28D01en', new Date('2026-11-10T19:02:00.005Z'), 'ffff', 'json')).toBe(
      'cpx.cbc.gov.tw/API/DataAPI/Get/2026-11-11/030200005_ffff.json'
    );
    // 中文檔名解碼，萬用字元保留 %XX
    expect(rawObjectName('https://example.gov.tw/a/%E5%9F%BA%E9%87%91%2A.csv', new Date('2026-11-11T00:00:00.000Z'), 'ab', 'csv')).toBe(
      'example.gov.tw/a/基金%2A.csv/2026-11-11/080000000_ab.csv'
    );
  });

  it('stores the response with the v1 metadata and records its gs:// URL', async () => {
    const [got, objects] = await inRun(() => keepUpstream(NAV_URL, 'csv', async () => response(200, 'csv')));
    expect(got.body.toString()).toBe('csv');
    const [bucket, name, body, contentType, metadata] = gcs.putObjectIfAbsent.mock.calls[0]!;
    expect([bucket, body.toString(), contentType]).toEqual(['bronze-test', 'csv', 'text/csv']);
    expect(name).toMatch(/^www\.sitca\.org\.tw\/MemberK0000\/F\/03\/nav\.csv\/\d{4}-\d{2}-\d{2}\/\d{9}_[0-9a-f]{12}\.csv$/);
    expect(metadata).toMatchObject({ source_url: NAV_URL, method: 'GET', http_status: '200', last_modified: 'Tue, 11 Nov 2026 13:00:00 GMT' });
    expect(metadata.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/);
    expect(metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(objects).toEqual([`gs://bronze-test/${name}`]);
  });

  it('stores error responses too and leaves the decision to throw to the caller', async () => {
    const [got] = await inRun(() => keepUpstream(NAV_URL, 'csv', async () => response(503, 'busy')));
    expect(got.ok).toBe(false);
    expect(gcs.putObjectIfAbsent.mock.calls[0]![4]).toMatchObject({ http_status: '503' });
  });

  it('keeps the ingest going and logs [bronze-write-failed] when the store fails', async () => {
    gcs.putObjectIfAbsent.mockRejectedValueOnce(new Error('HTTP 403'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [got, objects] = await inRun(() => keepUpstream(NAV_URL, 'csv', async () => response(200, 'csv')));
    expect(got.body.toString()).toBe('csv');
    expect(objects).toEqual([]);
    const logged = JSON.parse(errors.mock.calls[0]![0] as string);
    expect(logged).toMatchObject({ severity: 'ERROR', dataset: 'v_fund_daily_navs', source_url: NAV_URL });
    expect(logged.message).toMatch(/^\[bronze-write-failed\] /);
    errors.mockRestore();
  });

  it('replays a stored response by URL without downloading, whatever BRONZE_BUCKET says', async () => {
    delete process.env.BRONZE_BUCKET;
    gcs.getObject.mockResolvedValue({ body: Buffer.from('kept'), contentType: 'text/csv', metadata: { source_url: NAV_URL, http_status: '200', last_modified: 'Mon, 10 Nov 2026 13:00:00 GMT' } });
    const download = vi.fn();
    const ref = 'gs://oingg-gov-bronze/www.sitca.org.tw/MemberK0000/F/03/nav.csv/2026-11-10/220200000_aaa.csv';
    const [got, objects] = await inRun(() => keepUpstream(NAV_URL, 'csv', download), [ref]);
    expect(download).not.toHaveBeenCalled();
    expect(gcs.putObjectIfAbsent).not.toHaveBeenCalled();
    expect(gcs.getObject).toHaveBeenCalledWith('oingg-gov-bronze', 'www.sitca.org.tw/MemberK0000/F/03/nav.csv/2026-11-10/220200000_aaa.csv');
    expect([got.ok, got.body.toString(), got.headers.get('last-modified')]).toEqual([true, 'kept', 'Mon, 10 Nov 2026 13:00:00 GMT']);
    expect(objects).toEqual([ref]);
  });

  it('replays objects written before v1 and records them as gs:// URLs', async () => {
    gcs.getObject.mockResolvedValue({ body: Buffer.from('old'), contentType: 'text/csv', metadata: { url: NAV_URL, status: '200', 'last-modified': 'Mon, 10 Nov 2026 13:00:00 GMT' } });
    const [got, objects] = await inRun(() => keepUpstream(NAV_URL, 'csv', vi.fn()), ['fund-daily-nav/2026-11-11/103752_58052ec0f9bb.csv']);
    expect(gcs.getObject).toHaveBeenCalledWith('oingg-gov-bronze', 'fund-daily-nav/2026-11-11/103752_58052ec0f9bb.csv');
    expect([got.status, got.headers.get('last-modified')]).toEqual([200, 'Mon, 10 Nov 2026 13:00:00 GMT']);
    expect(objects).toEqual(['gs://oingg-gov-bronze/fund-daily-nav/2026-11-11/103752_58052ec0f9bb.csv']);
  });

  it('refuses to replay a URL the run did not store', async () => {
    gcs.getObject.mockResolvedValue({ body: Buffer.from(''), contentType: 'text/csv', metadata: { source_url: 'https://example.com/other.csv', http_status: '200' } });
    await expect(inRun(() => keepUpstream(NAV_URL, 'csv', vi.fn()), ['gs://b/x.csv'])).rejects.toThrow('沒有存');
  });
});

describe('job and dataset mapping', () => {
  it('covers every scheduled or stopped job with a distinct dataset', () => {
    // scripts/ 不在 tsc 的 rootDir 裡，不能 import，直接讀檔取每支排程的端點（jobs 加 stoppedJobs，同 rateLimiter.test.ts）。
    const jobs = [...readFileSync('scripts/scheduler.config.ts', 'utf-8').matchAll(/path: '\/api\/ingest\/([a-z0-9-]+)'/g)].map((match) => match[1]!);
    expect(Object.keys(DATASET_BY_JOB).sort()).toEqual([...jobs].sort());
    expect(new Set(Object.values(DATASET_BY_JOB)).size).toBe(jobs.length);
  });

  it('replays every run of a snapshot-window dataset but only the last run of the others', () => {
    expect(pickRunsToReplay('v_fund_daily_navs', [1, 2, 3])).toEqual([1, 2, 3]);
    expect(pickRunsToReplay('v_labor_broker_licenses', [1, 2, 3])).toEqual([3]);
  });
});

describe('bronzeRun middleware', () => {
  const call = async (path: string, body: unknown) => {
    const res = { statusCode: 200, status: vi.fn((code: number) => ((res.statusCode = code), res)), json: vi.fn(() => res) };
    const next = vi.fn();
    await bronzeRun({ path, body } as unknown as Request, res as unknown as Response, next);
    return { res, next };
  };

  it('rejects replaying a run of another dataset', async () => {
    db.ingestionRun.findUnique.mockResolvedValue({ dataset: 'v_fund_profiles', rawObjects: ['gs://b/x.csv'] });
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
