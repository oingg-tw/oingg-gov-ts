// 投信投顧公會(SITCA)在 data.gov.tw 登記的開放資料集，實際檔案掛在 sitca.org.tw，固定路徑 CSV
// 直連，無查詢式 API。跟其他 service（例如 oingg-sitca-ts）的分工是：登記在 data.gov.tw 平台的
// 正式開放資料集歸這裡（gov-ts），sitca.org.tw 上其他非 data.gov.tw 登記的 WebForms 報表/
// FundClear 才是 oingg-sitca-ts 的範疇（2026-09-11 跨服務對齊）。
//
// 注意：data.gov.tw 記載的下載網址是 `sitca.org.tw`（不帶 www），實測會 DNS 解析失敗
// （getaddrinfo ENOTFOUND），要用 `www.sitca.org.tw` 才連得上——這是實測發現，不是文件筆誤就能
// 看出來的坑，其他要接 SITCA 資料的人會踩到同一個問題。
//
// 兩份 CSV（境內基金基本資料、每日淨值）都已用真實檔案核對過：UTF-8 with BOM、無欄位內含逗號、
// 無雙引號跳脫需求，用簡單的 split(',') 就夠，不需要像 fia/client.ts 那樣處理引號跳脫。

export interface SitcaCsvFetchResult {
  content: string;
  // 伺服器回應的 Last-Modified header，轉成的日期——這是「SITCA 那邊實際更新這個檔案的時間」，
  // 不是我們 ingest 的時間。實測發現 fund_basic_info 這份月快照的真實發布時間跟月底有明顯落差
  // （7月資料的 Last-Modified 是8月18日），累積多次這個欄位的紀錄，才能之後回頭校準排程時間，
  // 不用每次都手動 curl -I 去查。可能是 null——不是每個回應都保證有這個 header。
  lastModified: Date | null;
}

export const fetchSitcaCsv = async (url: string): Promise<SitcaCsvFetchResult> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SITCA CSV 下載失敗：HTTP ${response.status}（url=${url}）`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const content = buffer.toString('utf8').replace(/^﻿/, ''); // 去掉 BOM，避免第一欄位名稱比對失敗

  const lastModifiedHeader = response.headers.get('last-modified');
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;

  return { content, lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null };
};
