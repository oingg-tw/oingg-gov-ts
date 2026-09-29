import type { EcbPolicyRatePoint } from '@/domains/ecbPolicyRate/types';

// ECB 的三大政策利率（官方稱 "key ECB interest rates"），SDMX dataflow FM、日頻率、歐元區合計：
export const DEPOSIT_FACILITY_SERIES = 'FM/D.U2.EUR.4F.KR.DFR.LEV'; // 存款機制利率
export const MARGINAL_LENDING_SERIES = 'FM/D.U2.EUR.4F.KR.MLFR.LEV'; // 邊際貸款機制利率
// 主要再融資利率（MRO）被 ECB 拆成兩支，因為標售機制換過兩次：
export const MAIN_REFINANCING_FIXED_SERIES = 'FM/D.U2.EUR.4F.KR.MRR_FR.LEV'; // 固定利率標售：1999-01-01~2000-06-27、2008-10-15~
export const MAIN_REFINANCING_MIN_BID_SERIES = 'FM/D.U2.EUR.4F.KR.MRR_MBR.LEV'; // 最低投標利率（變動利率標售）：2000-06-28~2008-10-14
// 2026-09-29 實測：兩支的日期沒有任何一天重疊，聯集（7,103 + 3,031 = 10,134 天）剛好等於 DFR/MLFR
// 的完整涵蓋範圍，所以縫起來不會有洞也不會有衝突。下面仍然保留「兩支都有值就以固定利率標售為準」的
// 處理，萬一 ECB 哪天回填造成重疊，行為是確定的而不是看 Map 寫入順序。

// ECB 的 csvdata 格式：表頭是維度名稱＋TIME_PERIOD＋OBS_VALUE，欄位順序會隨 dataflow 不同，
// 所以按名稱找 index，不用固定位置。
const parseEcbRows = (csv: string, seriesPath: string): [string, number][] => {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = (lines[0] ?? '').split(',');
  const dateIndex = header.indexOf('TIME_PERIOD');
  const valueIndex = header.indexOf('OBS_VALUE');
  if (dateIndex === -1 || valueIndex === -1) {
    throw new Error(`ECB ${seriesPath} CSV 缺少 TIME_PERIOD/OBS_VALUE 欄位（表頭為「${lines[0]}」），格式可能已變更。`);
  }

  const rows: [string, number][] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const date = cells[dateIndex];
    const rawValue = cells[valueIndex];
    if (!date || rawValue === undefined) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (rawValue.trim() === '') continue; // ECB 的缺值是空字串
    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;
    rows.push([date, value]);
  }
  if (rows.length === 0) {
    throw new Error(`ECB ${seriesPath} 沒有解析出任何觀測值，來源可能回了空結果。`);
  }
  return rows;
};

const toUtcDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};

/**
 * 四支日頻率序列 → 「每列一次變動」的事件序列（2026-09-29 實測 69 列，1999-01-01 起）。
 * 跟 cbc_policy_rate / us_policy_rate 同一種形狀：ECB 原始資料是每日持平值（10,134 天），這裡 diff
 * 相鄰值，只在四個欄位任一改變時出一列。
 *
 * 注意三支利率不是每次都同步調整：實測 69 列裡有 7 列主要再融資利率沒動、只動了存款機制或邊際貸款
 * 機制（ECB 調整利率走廊寬度，例如 2015-12-09、2019-09-18），所以下游若拿主要再融資利率當代表利率
 * 算變動幅度，會有幾列變動幅度是 0——那不是錯，那是真的只調了走廊。
 */
export const parseEcbPolicyRate = (
  depositCsv: string,
  marginalCsv: string,
  mainFixedCsv: string,
  mainMinBidCsv: string
): EcbPolicyRatePoint[] => {
  const deposit = new Map(parseEcbRows(depositCsv, DEPOSIT_FACILITY_SERIES));
  const marginal = new Map(parseEcbRows(marginalCsv, MARGINAL_LENDING_SERIES));
  const mainFixed = new Map(parseEcbRows(mainFixedCsv, MAIN_REFINANCING_FIXED_SERIES));
  const mainMinBid = new Map(parseEcbRows(mainMinBidCsv, MAIN_REFINANCING_MIN_BID_SERIES));

  const points: EcbPolicyRatePoint[] = [];
  let prev: EcbPolicyRatePoint | null = null;
  // 以存款機制利率的日期為基準走訪——它是四支裡涵蓋最完整的一支（1999-01-01 起無間斷）。
  for (const date of [...deposit.keys()].sort()) {
    const depositRate = deposit.get(date)!;
    const marginalRate = marginal.get(date);
    const fixed = mainFixed.get(date);
    const minBid = mainMinBid.get(date);
    const mainRate = fixed ?? minBid;
    // 某一天只有部分利率有值就跳過那天——存半組政策利率比沒有更糟（跟 usPolicyRate 同一個取捨）。
    if (marginalRate === undefined || mainRate === undefined) continue;

    const point: EcbPolicyRatePoint = {
      effectiveDate: toUtcDate(date),
      depositFacilityRate: depositRate,
      mainRefinancingRate: mainRate,
      marginalLendingRate: marginalRate,
      mainRefinancingIsMinimumBid: fixed === undefined,
    };
    if (
      prev &&
      prev.depositFacilityRate === point.depositFacilityRate &&
      prev.mainRefinancingRate === point.mainRefinancingRate &&
      prev.marginalLendingRate === point.marginalLendingRate &&
      prev.mainRefinancingIsMinimumBid === point.mainRefinancingIsMinimumBid
    ) {
      continue;
    }
    points.push(point);
    prev = point;
  }
  return points;
};
