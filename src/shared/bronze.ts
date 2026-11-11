import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { getObject, putObjectIfAbsent, type GcsObject } from '@/adapters/gcs/client';
import { config, readCleanEnv } from '@/shared/config';

// 銅層（使用者 2026-11-11 定的）：每次向上游抓的回應，不管成功失敗，都原樣存進 GCS oingg-gov-bronze，
// 只增不刪、長期保留（30 天後轉 Coldline，見 scripts/bronze-lifecycle.json）。解析寫錯、要多抽欄位時從這裡重跑。
// 先存再解析，存不進去這次匯入就算失敗，不安靜跳過。
//
// 一個 /api/ingest 請求是一次匯入：middleware（shared/middleware.ts 的 bronzeRun）用 runRawContext 開範圍，
// 這次存的物件路徑由 adapters/prisma 寫進 ingestion_runs.raw_objects。帶 replayRunId 時不連上游，
// 改回放那次存的檔，用網址對應，同一套解析程式重跑。

export interface UpstreamResponse {
  ok: boolean; // 2xx
  status: number;
  headers: Headers;
  body: Buffer<ArrayBuffer>;
}

interface RawRun {
  job: string; // /api/ingest/<job>，也是物件路徑的第一層
  objects: string[];
  replay?: { paths: string[]; loaded: Map<string, GcsObject> };
}

const runs = new AsyncLocalStorage<RawRun>();

export const runRawContext = <T>(job: string, replayPaths: string[] | undefined, fn: () => T): T =>
  runs.run({ job, objects: [], replay: replayPaths && { paths: replayPaths, loaded: new Map() } }, fn);

export const currentRawObjects = (): string[] => [...(runs.getStore()?.objects ?? [])];

// <job>/<台北日期>/<台北時間 HHmmss>_<sha256 前 12 碼>.<副檔名>
export const rawObjectName = (job: string, at: Date, sha256: string, ext: string): string => {
  const [date, time] = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', dateStyle: 'short', timeStyle: 'medium' })
    .format(at)
    .split(' ');
  return `${job}/${date}/${time!.replaceAll(':', '')}_${sha256.slice(0, 12)}.${ext}`;
};

const replayFrom = async (run: RawRun, bucket: string, url: string): Promise<UpstreamResponse> => {
  const wanted = encodeURI(url);
  for (const path of run.replay!.paths) {
    let stored = run.replay!.loaded.get(path);
    if (!stored) {
      stored = await getObject(bucket, path);
      run.replay!.loaded.set(path, stored);
    }
    if (stored.metadata.url !== wanted) continue;
    run.objects.push(path);
    const headers = new Headers({ 'content-type': stored.contentType });
    if (stored.metadata['last-modified']) headers.set('last-modified', stored.metadata['last-modified']);
    const status = Number(stored.metadata.status);
    return { ok: status >= 200 && status < 300, status, headers, body: stored.body };
  }
  throw new Error(`要重跑的那次匯入沒有存 ${url} 的原始回應`);
};

// download 要對任何 HTTP 狀態都回傳（不要遇到 4xx/5xx 就丟錯），錯誤回應也要存；要不要丟錯由呼叫端看 ok 決定。
export const keepUpstream = async (url: string, ext: string, download: () => Promise<UpstreamResponse>): Promise<UpstreamResponse> => {
  const run = runs.getStore();
  const bucket = readCleanEnv('BRONZE_BUCKET');
  if (!run || !bucket) {
    if (config.isProduction) throw new Error(`正式環境的上游請求沒有存進銅層（${run ? '沒設 BRONZE_BUCKET' : '不在匯入範圍裡'}），url=${url}`);
    return download(); // 本機跑、測試：不存
  }
  if (run.replay) return replayFrom(run, bucket, url);

  const response = await download();
  const sha256 = createHash('sha256').update(response.body).digest('hex');
  const path = rawObjectName(run.job, new Date(), sha256, ext);
  const lastModified = response.headers.get('last-modified');
  await putObjectIfAbsent(bucket, path, response.body, response.headers.get('content-type') ?? 'application/octet-stream', {
    url: encodeURI(url),
    status: String(response.status),
    sha256,
    ...(process.env.K_REVISION ? { revision: process.env.K_REVISION } : {}),
    ...(lastModified ? { 'last-modified': lastModified } : {}),
  });
  run.objects.push(path);
  return response;
};

// 重跑一段日期（scripts/replayIngest.ts）：SITCA 兩支的檔案只涵蓋最近 2 個交易日／當月，區間裡每一次都要依序重跑；
// 其他來源每個檔就是整段歷史或整份現況，只重跑最後一次就好（依序全跑，最後留下的也是最後那次）。
const SNAPSHOT_WINDOW_JOBS = new Set(['fund-daily-nav', 'fund-basic-info']);
export const pickRunsToReplay = <T>(job: string, runsInOrder: T[]): T[] => (SNAPSHOT_WINDOW_JOBS.has(job) ? runsInOrder : runsInOrder.slice(-1));

export const fetchUpstream = (url: string, ext: string, init?: RequestInit): Promise<UpstreamResponse> =>
  keepUpstream(url, ext, async () => {
    const response = await fetch(url, init);
    return { ok: response.ok, status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
  });
