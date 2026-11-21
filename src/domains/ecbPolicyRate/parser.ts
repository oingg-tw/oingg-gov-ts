import type { EcbPolicyRatePoint } from '@/domains/ecbPolicyRate/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// ECB 的三大政策利率（官方稱 "key ECB interest rates"），SDMX dataflow FM、歐元區合計。用 B 頻率的「調整日」序列
// （date of changes）：每列是一次調整的生效日，四支合計約 200 列。2026-11-22 以前用 D（日）頻率：四支每天約 2MB，
// 只多一筆持平值，銅層天天多存一份（管理站轉使用者的話：重複拉大量資料要拿掉）。換之前比對過，兩種序列算出的 69 列逐列相同。
export const DEPOSIT_FACILITY_SERIES = 'FM/B.U2.EUR.4F.KR.DFR.LEV'; // 存款機制利率
export const MARGINAL_LENDING_SERIES = 'FM/B.U2.EUR.4F.KR.MLFR.LEV'; // 邊際貸款機制利率
// 主要再融資利率（MRO）被 ECB 拆成兩支，因為標售機制換過兩次：
export const MAIN_REFINANCING_FIXED_SERIES = 'FM/B.U2.EUR.4F.KR.MRR_FR.LEV'; // 固定利率標售：1999-01-01~2000-06-27、2008-10-15~
export const MAIN_REFINANCING_MIN_BID_SERIES = 'FM/B.U2.EUR.4F.KR.MRR_MBR.LEV'; // 最低投標利率（變動利率標售）：2000-06-28~2008-10-14
// 哪一支在用，看誰的最近一筆比較新；MRR_MBR 在 2008-10-15 有一筆空值當結束標記，空值照常跳過，那天固定利率已經有值。
// 同一天兩支都有值就以固定利率標售為準，萬一 ECB 哪天回填造成重疊，行為是確定的。

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
    const value = parseSourceNumber(rawValue, [''], `ECB ${seriesPath} ${date}`);
    if (value === null) continue; // ECB 的缺值是空字串
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
 * 四支序列 → 「每列一次變動」的事件序列（2026-11-22 實測 69 列，1999-01-01 起），跟 cbc_policy_rate / us_policy_rate
 * 同一種形狀。走訪四支所有日期的聯集，每個日期取各支到那天為止最近的一筆，四個欄位任一改變才出一列。
 * 調整日序列和日序列（2026-11-22 以前存進銅層的檔）都適用：日序列每天都有值，取到的就是當天的值。
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
  const series = [
    parseEcbRows(depositCsv, DEPOSIT_FACILITY_SERIES),
    parseEcbRows(marginalCsv, MARGINAL_LENDING_SERIES),
    parseEcbRows(mainFixedCsv, MAIN_REFINANCING_FIXED_SERIES),
    parseEcbRows(mainMinBidCsv, MAIN_REFINANCING_MIN_BID_SERIES),
  ].map((rows) => rows.sort(([a], [b]) => a.localeCompare(b)));
  const next = series.map(() => 0);
  const latest: ([string, number] | undefined)[] = series.map(() => undefined);

  const points: EcbPolicyRatePoint[] = [];
  let prev: EcbPolicyRatePoint | null = null;
  for (const date of [...new Set(series.flat().map(([d]) => d))].sort()) {
    series.forEach((rows, i) => {
      while (next[i]! < rows.length && rows[next[i]!]![0] <= date) latest[i] = rows[next[i]!++];
    });
    const [deposit, marginal, fixed, minBid] = latest;
    const main = minBid && (!fixed || minBid[0] > fixed[0]) ? minBid : fixed;
    // 還有利率沒開始就跳過——存半組政策利率比沒有更糟（跟 usPolicyRate 同一個取捨）。
    if (!deposit || !marginal || !main) continue;

    const point: EcbPolicyRatePoint = {
      effectiveDate: toUtcDate(date),
      depositFacilityRate: deposit[1],
      mainRefinancingRate: main[1],
      marginalLendingRate: marginal[1],
      mainRefinancingIsMinimumBid: main === minBid,
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
