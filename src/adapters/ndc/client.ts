import AdmZip from 'adm-zip';
import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 國發會景氣指標及燈號（data.gov.tw/dataset/6099），固定路徑 ZIP 檔案，不是正式 REST API。實際
// 打開 https://data.gov.tw/api/v2/rest/dataset/6099 查到的下載連結（2026-09-02）——這個 URL 本身
// 帶了一串 base64 編碼的路徑/檔名參數，是國發會下載服務自己的格式，不是我方拼出來的。
const BUSINESS_CYCLE_ZIP_URL =
  'https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82MzkyL2VhMjM1YmQ5LWQwNTItNGE2OS1hYmZjLWQ1Yzc4NWQzZDBlMi56aXA%3d&n=5pmv5rCj5oyH5qiZ5Y%2bK54eI6JmfLnppcA%3d%3d&icon=.zip';

// ZIP 裡實際有 11 個檔案（2026-09-02 用真實檔案核對過）：manifest.csv、4 份「構成項目」schema+data
// CSV（同時/景氣對策信號/落後/領先指標構成項目），跟這裡要的主檔「景氣指標與燈號.csv」。構成項目
// 那 4 份（M1B、股價指數、失業率等細項）暫不解析，只取主檔——如果之後要往下鑽到細項再擴充。
const TARGET_ENTRY_NAME = '景氣指標與燈號.csv';

// 回傳 CSV 原始文字（UTF-8 with BOM，呼叫端自己處理 BOM/表頭）。ws.ndc.gov.tw 的 TLS 憑證正常
// （不像 ws.dgbas.gov.tw 那台主機，見 adapters/dgbas/client.ts 的說明），用一般 fetch 即可。
export const fetchBusinessCycleIndicatorCsv = async (): Promise<string> => {
  const response = await fetch(BUSINESS_CYCLE_ZIP_URL, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`國發會景氣指標 ZIP 下載失敗：HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry(TARGET_ENTRY_NAME);
  if (!entry) {
    throw new Error(`國發會景氣指標 ZIP 裡找不到「${TARGET_ENTRY_NAME}」，格式可能已變更。`);
  }

  return entry.getData().toString('utf8');
};
