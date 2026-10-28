import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 集保結算所（TDCC）在 data.gov.tw 登記的開放資料集，檔案掛在 opendata.tdcc.com.tw，固定路徑 CSV。
// URL 是 https://data.gov.tw/api/v2/rest/dataset/11452 的 resourceDownloadUrl 原文（2026-10-28）。
// 同一份資料集保另有 OpenAPI（/v1/opendata/1-5，oingg-sitca-ts 原本打的那支），這裡照 gov 的分工抓
// data.gov.tw 登記的資源。實測 UTF-8 with BOM、無引號跳脫、沒有 Last-Modified header。
const SHAREHOLDING_DISTRIBUTION_CSV_URL = 'https://opendata.tdcc.com.tw/getOD.ashx?id=1-5';

export const fetchShareholdingDistributionCsv = async (): Promise<string> => {
  const response = await fetch(SHAREHOLDING_DISTRIBUTION_CSV_URL, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`集保股權分散表 CSV 下載失敗：HTTP ${response.status}`);
  }
  return (await response.text()).replace(/^﻿/, ''); // 去掉 BOM，避免表頭比對失敗
};
