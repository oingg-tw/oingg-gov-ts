import { OUTBOUND_USER_AGENT } from '@/shared/config';

// FRED（美國聖路易聯邦準備銀行的經濟資料庫）的序列 CSV 直連。這是 gov-ts 第一個非台灣來源
// （2026-09-22，使用者裁定放 gov-ts，定位從「台灣政府開放資料」擴大成「官方統計來源」）。
//
// 走的是 FRED 網站每個序列頁面上「Download data → CSV」那條固定路徑（fredgraph.csv?id=<序列代碼>），
// 不需要帳號或 API key；FRED 另有正式的 REST API（需免費 API key），使用者選了免 key 的路徑，跟
// DGBAS/SITCA 固定路徑檔案是同一種模式。2026-09-22 核對過 robots.txt：`User-agent: *` 只 Disallow
// /graph/fredgraph.png、/graph/image.php 這類圖檔跟搜尋頁，fredgraph.csv 不在內，Crawl-delay 1 秒
// （我們每月打一次）。回應有 Last-Modified header（FRED 每次更新序列會變），記進 ingestion_runs 的
// sourceLastModified，跟 SITCA 的做法一樣。
//
// CSV 格式（用 GNPDEF 真實檔案核對）：表頭 `observation_date,<序列代碼>`，之後每列 `YYYY-MM-DD,<值>`，
// 季資料的日期是該季第一天（1947-01-01 = 1947Q1）。FRED 的缺值標記是 "."（GNPDEF 整份沒有，但其他
// 序列有），parser 要處理。
const FRED_CSV_BASE_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

export interface FredCsvFetchResult {
  content: string;
  lastModified: Date | null;
}

export const fetchFredSeriesCsv = async (seriesId: string): Promise<FredCsvFetchResult> => {
  const url = `${FRED_CSV_BASE_URL}?id=${encodeURIComponent(seriesId)}`;
  const response = await fetch(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`FRED CSV 下載失敗：HTTP ${response.status}（series=${seriesId}）`);
  }
  const content = await response.text();

  const lastModifiedHeader = response.headers.get('last-modified');
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;

  return { content, lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null };
};
