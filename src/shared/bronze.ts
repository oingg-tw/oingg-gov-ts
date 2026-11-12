import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { getObject, getObjectMetadata, putObjectIfAbsent, type GcsObject } from '@/adapters/gcs/client';
import { config, readCleanEnv } from '@/shared/config';

// 銅層（使用者 2026-11-11 定的，格式照五個上游服務共用的 v1）：每次向上游抓的回應，不管成功失敗，都先原樣存進
// GCS 再解析；2026-11-12 起跟同一網址上次存的一樣（sha256 和狀態碼都同）就不再存，記上次那個檔（見 reusableObject）。
// BRONZE_BUCKET 決定寫哪裡：正式環境 oingg-gov-bronze（只增不刪、長期保留），本機寫 DEV 時
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
  previous: string[]; // 這個資料集最近幾次匯入記的 raw_objects，找同一網址上次存的檔用（shared/bronzeRun.ts 帶進來）
  replay?: { refs: string[]; loaded: Map<string, GcsObject> };
}

const runs = new AsyncLocalStorage<RawRun>();

export const runRawContext = <T>(dataset: string, replayRefs: string[] | undefined, fn: () => T, previous: string[] = []): T =>
  runs.run({ dataset, objects: [], previous, replay: replayRefs && { refs: replayRefs, loaded: new Map() } }, fn);

export const currentRawObjects = (): string[] => [...(runs.getStore()?.objects ?? [])];

// 台灣沒有日光節約時間，台北時間固定是 UTC+8。回傳 'YYYY-MM-DDTHH:mm:ss.SSS'。
const taipeiTime = (at: Date): string => new Date(at.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 23);

// 路徑用解碼後的字元（中文檔名照原樣），萬用字元和控制字元保留 %XX；完整網址另外記在 source_url。
// oxlint-disable-next-line no-control-regex -- 就是要把控制字元編碼回去
const KEEP_ENCODED = /[*?[\]#\x00-\x1f\x7f]/g;
const pathSegment = (segment: string): string =>
  decodeURIComponent(segment).replace(KEEP_ENCODED, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

// <來源主機>/<端點路徑>/：查詢參數不進路徑，同一端點不同參數的請求（央行、FRED）共用這一層。
const endpointFolder = (url: string): string => {
  const { host, pathname } = new URL(url);
  return [host, ...pathname.split('/').filter(Boolean).map(pathSegment), ''].join('/');
};

// <來源主機>/<端點路徑>/<台北日期>/<台北時間 HHmmssSSS>_<sha256 前 12 碼>.<副檔名>
export const rawObjectName = (url: string, at: Date, sha256: string, ext: string): string => {
  const local = taipeiTime(at);
  return `${endpointFolder(url)}${local.slice(0, 10)}/${local.slice(11).replace(/[:.]/g, '')}_${sha256.slice(0, 12)}.${ext}`;
};

const parseRef = (ref: string): { bucket: string; name: string } => {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(ref);
  if (!match) throw new Error(`raw_objects 的 ${ref} 不是 gs:// 網址`);
  return { bucket: match[1]!, name: match[2]! };
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
    if (meta.source_url !== wanted) continue;
    run.objects.push(`gs://${bucket}/${name}`);
    const headers = new Headers({ 'content-type': stored.contentType });
    if (meta.last_modified) headers.set('last-modified', meta.last_modified);
    const status = Number(meta.http_status);
    return { ok: status >= 200 && status < 300, status, headers, body: stored.body };
  }
  throw new Error(`要重跑的那次匯入沒有存 ${url} 的原始回應`);
};

// 同一網址最近一次存的檔：從新到舊看這次和最近幾次匯入記的檔，只取最新那一個，所以 A → B → A 的第三次照樣存。
// 端點路徑不含查詢參數，要讀 metadata 的 source_url 才分得出是哪個請求。別的 bucket 的檔不算（DEV 分支裡有 PRD 的紀錄）。
const latestStored = async (run: RawRun, bucket: string, url: string): Promise<{ ref: string; metadata: Record<string, string> } | undefined> => {
  const folder = `gs://${bucket}/${endpointFolder(url)}`;
  const candidates = [...new Set([...run.objects, ...run.previous])].filter((ref) => ref.startsWith(folder)).sort().reverse();
  for (const ref of candidates) {
    const metadata = await getObjectMetadata(bucket, ref.slice(`gs://${bucket}/`.length));
    if (metadata.source_url === encodeURI(url)) return { ref, metadata };
  }
  return undefined;
};

// 拿來比「內容一樣」的形式；來源每次回應都帶產生時間時由呼叫端給（見 adapters/cbc）。存的檔和 sha256 照舊是原始 bytes。
export type Comparable = (body: Buffer) => string;

// 可以沿用的上次那個檔。重跑會回傳檔裡存的狀態碼，所以內容一樣但狀態碼不同（例如同一頁的 200 和 503）也要另存。
// 查不到上次的檔或查失敗就照存。
const reusableObject = async (run: RawRun, bucket: string, url: string, response: UpstreamResponse, sha256: string, comparable?: Comparable) => {
  try {
    const latest = await latestStored(run, bucket, url);
    if (!latest || latest.metadata.http_status !== String(response.status)) return undefined;
    if (latest.metadata.sha256 === sha256) return latest.ref;
    if (!comparable) return undefined;
    const { body } = await getObject(bucket, latest.ref.slice(`gs://${bucket}/`.length));
    return comparable(body) === comparable(response.body) ? latest.ref : undefined;
  } catch (error) {
    console.warn(`[bronze] 找不到 ${url} 上次存的檔，照存：${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

// PRD 的 Neon endpoint（pooler 和直連的主機名都以它開頭）。
const PRD_DATABASE_ENDPOINT = 'ep-delicate-dream-az4wuglk';
const usesPrdDatabase = (): boolean => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname.startsWith(PRD_DATABASE_ENDPOINT);
  } catch {
    return false;
  }
};

const logWriteFailure = (dataset: string, url: string, error: string): void =>
  console.error(JSON.stringify({ severity: 'ERROR', message: `[bronze-write-failed] ${dataset} ${url}：${error}`, dataset, source_url: url, error }));

// download 要對任何 HTTP 狀態都回傳（不要遇到 4xx/5xx 就丟錯），錯誤回應也要存；要不要丟錯由呼叫端看 ok 決定。
export const keepUpstream = async (
  url: string,
  ext: string,
  download: () => Promise<UpstreamResponse>,
  method = 'GET',
  comparable?: Comparable
): Promise<UpstreamResponse> => {
  const run = runs.getStore();
  if (run?.replay) return replayFrom(run, url);
  // 使用者 2026-11-12 定的：本機寫 PRD 的匯入沒有銅層就拒跑。本機又不准寫正式 bucket（dev bucket 30 天會刪），
  // 所以本機連 PRD 時一律不連上游；重跑只讀銅層，不受影響。
  if (!config.isProduction && usesPrdDatabase()) {
    throw new Error(`本機連的是 PRD 資料庫，不能連上游匯入（${url}）：這種匯入只能在 Cloud Run 跑，重跑請帶 replayRunId。`);
  }

  const response = await download();
  const bucket = readCleanEnv('BRONZE_BUCKET');
  if (!run || !bucket) {
    if (config.isProduction) logWriteFailure(run?.dataset ?? 'unknown', url, run ? '沒設 BRONZE_BUCKET' : '不在匯入範圍裡');
    else if (run) console.warn('[bronze] 沒設 BRONZE_BUCKET，這次的原始回應沒存（寫 DEV 時設 oingg-gov-bronze-dev）');
    return response;
  }

  const at = new Date();
  const sha256 = createHash('sha256').update(response.body).digest('hex');
  const reuse = await reusableObject(run, bucket, url, response, sha256, comparable);
  if (reuse) {
    run.objects.push(reuse);
    return response;
  }
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

export const fetchUpstream = (url: string, ext: string, init?: RequestInit, comparable?: Comparable): Promise<UpstreamResponse> =>
  keepUpstream(
    url,
    ext,
    async () => {
      const response = await fetch(url, init);
      return { ok: response.ok, status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
    },
    init?.method ?? 'GET',
    comparable
  );
