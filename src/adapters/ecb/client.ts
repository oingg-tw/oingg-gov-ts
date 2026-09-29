import { OUTBOUND_USER_AGENT } from '@/shared/config';

// ECB Data Portal 的 SDMX REST API（data-api.ecb.europa.eu），免帳號免 API key，官方對外文件化的
// 正式端點——不是網頁爬蟲路徑。gov-ts 第二個非台灣來源，定位跟 FRED 一樣是「官方統計來源」。
//
// 為什麼不沿用已經有的 FRED adapter（adapters/fred/client.ts）：FRED 確實有 ECB 三支利率的鏡像
// （ECBDFR / ECBMRRFR / ECBMLFR），但 ECBMRRFR 有一個會直接餵出錯誤數字的坑——ECB 在
// 2000-06-28 ~ 2008-10-14 改用「變動利率標售」，主要再融資利率在那段期間是「最低投標利率」而不是
// 「固定標售利率」，FRED 把那 3,031 天的固定標售利率填成字面上的 0.00。問題是 2016-03-16 ~
// 2022-07-26 的 0.00 是真的 0%，光看序列無法分辨哪個 0 是「真的零利率」哪個是「當時不適用」，
// 照抄會讓 2000-2008 年的歐元區政策利率顯示成 0%（實際是 3.25%~4.75%）。
// ECB 自己把這兩段拆成兩支序列（MRR_FR / MRR_MBR，2026-09-29 實測日期完全不重疊、聯集剛好等於
// DFR 的完整涵蓋範圍），所以直接向原始出處拿。
//
// 回應有 Last-Modified header，記進 ingestion_runs 的 sourceLastModified，跟 FRED/SITCA 一樣。
const ECB_DATA_API_BASE_URL = 'https://data-api.ecb.europa.eu/service/data';

export interface EcbCsvFetchResult {
  content: string;
  lastModified: Date | null;
}

/**
 * @param seriesPath SDMX 的 `<dataflow>/<series key>`，例如 `FM/D.U2.EUR.4F.KR.DFR.LEV`
 */
export const fetchEcbSeriesCsv = async (seriesPath: string): Promise<EcbCsvFetchResult> => {
  // detail=dataonly 去掉屬性欄位，只留維度＋觀測值
  const url = `${ECB_DATA_API_BASE_URL}/${seriesPath}?format=csvdata&detail=dataonly`;
  const response = await fetch(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`ECB Data Portal 下載失敗：HTTP ${response.status}（series=${seriesPath}）`);
  }
  const content = await response.text();

  const lastModifiedHeader = response.headers.get('last-modified');
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;

  return { content, lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null };
};
