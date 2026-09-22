import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 勞動部開放資料的 CSV 直連（apiservice.mol.gov.tw/OdService/download/<resourceId>）。每個資料集在
// data.gov.tw 上掛的 CSV 下載連結就長這樣，不需要 API key；同一個資料集的 CSV/JSON/XML 各有一組不同
// 的 resourceId，這裡只用 CSV。
//
// 2026-09-22 用兩份真實檔案核對過格式：UTF-8 with BOM、CRLF、欄位數固定（許可名冊 15 欄 4,963 列、
// 評鑑結果 12 欄 5,431 列），全部列的欄位數都一致，代表沒有欄位內含逗號需要處理引號跳脫——用簡單的
// split(',') 就夠，跟 sitca 那兩份 CSV 同一種情況，不需要像 fia/client.ts 那樣處理引號。
const MOL_CSV_BASE_URL = 'https://apiservice.mol.gov.tw/OdService/download';

export interface MolCsvFetchResult {
  content: string;
  lastModified: Date | null;
}

export const fetchMolCsv = async (resourceId: string): Promise<MolCsvFetchResult> => {
  const response = await fetch(`${MOL_CSV_BASE_URL}/${encodeURIComponent(resourceId)}`, {
    headers: { 'User-Agent': OUTBOUND_USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`勞動部開放資料 CSV 下載失敗：HTTP ${response.status}（resourceId=${resourceId}）`);
  }
  const content = (await response.text()).replace(/^﻿/, '');

  const lastModifiedHeader = response.headers.get('last-modified');
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;

  return { content, lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null };
};

// 勞動部這兩份檔案的日期欄位都是西元 8 碼（例如 "20061020"），不是民國年。空字串代表「沒有這個
// 狀態」（例如沒停業、沒廢止），回 null 而不是 0 或今天。
export const parseMolDate = (raw: string | undefined): Date | null => {
  const v = (raw ?? '').trim();
  if (!/^\d{8}$/.test(v)) return null;
  const year = Number(v.slice(0, 4));
  const month = Number(v.slice(4, 6));
  const day = Number(v.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

// 許可證號在兩份檔案裡格式不同：許可名冊補零成 4 碼（"0002"，換證的會帶後綴 "0002-1"），評鑑結果
// 不補零（"2"）。去掉前導零當作 join key，2026-09-22 實測 5,431 列評鑑資料 100% 對得上名冊。
export const normalizeLicenseNo = (raw: string): string => raw.trim().replace(/^0+(?=\d)/, '');
