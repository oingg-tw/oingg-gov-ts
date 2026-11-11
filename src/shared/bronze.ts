import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { getObject, putObjectIfAbsent, type GcsObject } from '@/adapters/gcs/client';
import { config, readCleanEnv } from '@/shared/config';

// 銅層（使用者 2026-11-11 定的，格式照五個上游服務共用的 v1）：每次向上游抓的回應，不管成功失敗，都先原樣存進
// GCS 再解析。BRONZE_BUCKET 決定寫哪裡：正式環境 oingg-gov-bronze（只增不刪、長期保留），本機寫 DEV 時
// oingg-gov-bronze-dev（30 天刪除）。寫不進 GCS 不擋匯入：記一筆 [bronze-write-failed] ERROR，
// log 指標 bronze_write_failures 會發告警（scripts/log-metric-bronze-write-failures.yaml）。
//
// 一個 /api/ingest 請求是一次匯入：shared/bronzeRun.ts 用 runRawContext 開範圍，這次存的 gs:// 網址由
// adapters/prisma 寫進 ingestion_runs.raw_objects。帶 replayRunId 時不連上游，照網址回放那次存的檔，
// 原本的解析程式照跑。

export interface UpstreamResponse {
  ok: boolean; // 2xx
  status: number;
  headers: Headers;
  body: Buffer<ArrayBuffer>;
}

interface RawRun {
  dataset: string; // ingestion_runs.dataset；寫入失敗的 log 帶這個當指標標籤
  objects: string[]; // gs://<bucket>/<name>
  replay?: { refs: string[]; loaded: Map<string, GcsObject> };
}

const runs = new AsyncLocalStorage<RawRun>();

export const runRawContext = <T>(dataset: string, replayRefs: string[] | undefined, fn: () => T): T =>
  runs.run({ dataset, objects: [], replay: replayRefs && { refs: replayRefs, loaded: new Map() } }, fn);

export const currentRawObjects = (): string[] => [...(runs.getStore()?.objects ?? [])];

// 台灣沒有日光節約時間，台北時間固定是 UTC+8。回傳 'YYYY-MM-DDTHH:mm:ss.SSS'。
const taipeiTime = (at: Date): string => new Date(at.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 23);

// 路徑用解碼後的字元（中文檔名照原樣），萬用字元和控制字元保留 %XX；完整網址另外記在 source_url。
// oxlint-disable-next-line no-control-regex -- 就是要把控制字元編碼回去
const KEEP_ENCODED = /[*?[\]#\x00-\x1f\x7f]/g;
const pathSegment = (segment: string): string =>
  decodeURIComponent(segment).replace(KEEP_ENCODED, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

// <來源主機>/<端點路徑>/<台北日期>/<台北時間 HHmmssSSS>_<sha256 前 12 碼>.<副檔名>；查詢參數不進路徑。
export const rawObjectName = (url: string, at: Date, sha256: string, ext: string): string => {
  const { host, pathname } = new URL(url);
  const endpoint = pathname.split('/').filter(Boolean).map(pathSegment);
  const local = taipeiTime(at);
  return [host, ...endpoint, local.slice(0, 10), `${local.slice(11).replace(/[:.]/g, '')}_${sha256.slice(0, 12)}.${ext}`].join('/');
};

// v1 之前（2026-11-11 revision 00042、00043）寫的是 oingg-gov-bronze 裡不帶 gs:// 的路徑，metadata 欄名也不同
// （url、status、last-modified）。舊檔不搬，重跑舊紀錄時照舊格式讀。
const LEGACY_BUCKET = 'oingg-gov-bronze';
const parseRef = (ref: string): { bucket: string; name: string } => {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(ref);
  return match ? { bucket: match[1]!, name: match[2]! } : { bucket: LEGACY_BUCKET, name: ref };
};

const replayFrom = async (run: RawRun, url: string): Promise<UpstreamResponse> => {
  const wanted = encodeURI(url);
  for (const ref of run.replay!.refs) {
    const { bucket, name } = parseRef(ref);
    let stored = run.replay!.loaded.get(ref);
    if (!stored) {
      stored = await getObject(bucket, name);
      run.replay!.loaded.set(ref, stored);
    }
    const meta = stored.metadata;
    if ((meta.source_url ?? meta.url) !== wanted) continue;
    run.objects.push(`gs://${bucket}/${name}`);
    const headers = new Headers({ 'content-type': stored.contentType });
    const lastModified = meta.last_modified ?? meta['last-modified'];
    if (lastModified) headers.set('last-modified', lastModified);
    const status = Number(meta.http_status ?? meta.status);
    return { ok: status >= 200 && status < 300, status, headers, body: stored.body };
  }
  throw new Error(`要重跑的那次匯入沒有存 ${url} 的原始回應`);
};

const logWriteFailure = (dataset: string, url: string, error: string): void =>
  console.error(JSON.stringify({ severity: 'ERROR', message: `[bronze-write-failed] ${dataset} ${url}：${error}`, dataset, source_url: url, error }));

// download 要對任何 HTTP 狀態都回傳（不要遇到 4xx/5xx 就丟錯），錯誤回應也要存；要不要丟錯由呼叫端看 ok 決定。
export const keepUpstream = async (
  url: string,
  ext: string,
  download: () => Promise<UpstreamResponse>,
  method = 'GET'
): Promise<UpstreamResponse> => {
  const run = runs.getStore();
  if (run?.replay) return replayFrom(run, url);

  const response = await download();
  const bucket = readCleanEnv('BRONZE_BUCKET');
  if (!run || !bucket) {
    if (config.isProduction) logWriteFailure(run?.dataset ?? 'unknown', url, run ? '沒設 BRONZE_BUCKET' : '不在匯入範圍裡');
    else if (run) console.warn('[bronze] 沒設 BRONZE_BUCKET，這次的原始回應沒存（寫 DEV 時設 oingg-gov-bronze-dev）');
    return response;
  }

  const at = new Date();
  const sha256 = createHash('sha256').update(response.body).digest('hex');
  const name = rawObjectName(url, at, sha256, ext);
  const lastModified = response.headers.get('last-modified');
  const etag = response.headers.get('etag');
  try {
    await putObjectIfAbsent(bucket, name, response.body, response.headers.get('content-type') ?? 'application/octet-stream', {
      source_url: encodeURI(url),
      method,
      http_status: String(response.status),
      fetched_at: `${taipeiTime(at)}+08:00`,
      sha256,
      ...(process.env.K_REVISION ? { revision: process.env.K_REVISION } : {}),
      ...(lastModified ? { last_modified: lastModified } : {}),
      ...(etag ? { etag } : {}),
    });
    run.objects.push(`gs://${bucket}/${name}`);
  } catch (error) {
    logWriteFailure(run.dataset, url, error instanceof Error ? error.message : String(error));
  }
  return response;
};

export const fetchUpstream = (url: string, ext: string, init?: RequestInit): Promise<UpstreamResponse> =>
  keepUpstream(
    url,
    ext,
    async () => {
      const response = await fetch(url, init);
      return { ok: response.ok, status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
    },
    init?.method ?? 'GET'
  );
