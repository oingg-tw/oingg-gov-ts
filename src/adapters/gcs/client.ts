import { readCleanEnv } from '@/shared/config';

// 銅層 bucket（oingg-gov-bronze）的讀寫，走 GCS XML API：一個 PUT 就能連同自訂 metadata（x-goog-meta-*）
// 寫入，不用為了三個呼叫拉進 @google-cloud/storage。權杖向 Cloud Run 的 metadata server 拿；本機驗證時
// 可以設 GCS_ACCESS_TOKEN（gcloud auth print-access-token）代替。
const GCS_HOST = 'https://storage.googleapis.com';
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

let cachedToken: { value: string; expiresAt: number } | null = null;

const accessToken = async (): Promise<string> => {
  const override = readCleanEnv('GCS_ACCESS_TOKEN');
  if (override) return override;
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const response = await fetch(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!response.ok) throw new Error(`向 metadata server 拿 GCS 權杖失敗：HTTP ${response.status}`);
  const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
};

const objectUrl = (bucket: string, name: string): string => `${GCS_HOST}/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;

// 只在物件不存在時建立（x-goog-if-generation-match: 0），銅層只增不刪。412 代表同名物件已經在了——
// 名稱含時間到秒和內容雜湊，同名就是同一份內容，當作已經存過。
export const putObjectIfAbsent = async (
  bucket: string,
  name: string,
  body: Buffer<ArrayBuffer>,
  contentType: string,
  metadata: Record<string, string>
): Promise<void> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    'Content-Type': contentType,
    'x-goog-if-generation-match': '0',
  };
  for (const [key, value] of Object.entries(metadata)) headers[`x-goog-meta-${key}`] = value;
  const response = await fetch(objectUrl(bucket, name), { method: 'PUT', headers, body });
  if (response.ok || response.status === 412) return;
  throw new Error(`寫入 gs://${bucket}/${name} 失敗：HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
};

export interface GcsObject {
  body: Buffer<ArrayBuffer>;
  contentType: string;
  metadata: Record<string, string>; // x-goog-meta-* 去掉前綴
}

const customMetadata = (headers: Headers): Record<string, string> => {
  const metadata: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.startsWith('x-goog-meta-')) metadata[key.slice('x-goog-meta-'.length)] = value;
  });
  return metadata;
};

export const getObject = async (bucket: string, name: string): Promise<GcsObject> => {
  const response = await fetch(objectUrl(bucket, name), { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!response.ok) throw new Error(`讀取 gs://${bucket}/${name} 失敗：HTTP ${response.status}`);
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    metadata: customMetadata(response.headers),
  };
};

// 只讀 metadata 不下載內容（HEAD），銅層找同一網址上次存的檔時用。
export const getObjectMetadata = async (bucket: string, name: string): Promise<Record<string, string>> => {
  const response = await fetch(objectUrl(bucket, name), { method: 'HEAD', headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!response.ok) throw new Error(`讀取 gs://${bucket}/${name} 的 metadata 失敗：HTTP ${response.status}`);
  return customMetadata(response.headers);
};
