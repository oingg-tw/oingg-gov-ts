import type { UsPolicyRatePoint } from '@/domains/usPolicyRate/types';

// Fed 的目標利率在 FRED 上被切成三個序列，因為 2008-12-16 起制度從「單一目標值」改成「目標區間」：
export const LEGACY_TARGET_SERIES = 'DFEDTAR'; // 單一目標，1982-09-27 → 2008-12-15
export const RANGE_UPPER_SERIES = 'DFEDTARU'; // 區間上限，2008-12-16 →
export const RANGE_LOWER_SERIES = 'DFEDTARL'; // 區間下限，同上
// 2026-09-28 實測：DFEDTAR 末筆 2008-12-15、DFEDTARU 首筆 2008-12-16，兩段無重疊也無空隙。

// FRED 的 CSV 是每日持平值（值不變的日子照樣出一列），所以 DFEDTAR 有 9,577 列、DFEDTARU 有 6,495 列，
// 但真正的變動只有 153 次跟 33 次。這裡 diff 相鄰值轉成「事件序列」，形狀跟 cbc_policy_rate 一致
// （每列一次調整），下游就不用自己找變動點。
const parseFredRows = (csv: string, seriesId: string): [string, number][] => {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines[0] !== `observation_date,${seriesId}`) {
    throw new Error(`FRED ${seriesId} CSV 表頭不符（收到「${lines[0]}」），格式可能已變更。`);
  }

  const rows: [string, number][] = [];
  for (const line of lines.slice(1)) {
    const [date, rawValue] = line.split(',');
    if (!date || rawValue === undefined) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (rawValue.trim() === '.') continue; // FRED 缺值標記
    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;
    rows.push([date, value]);
  }
  return rows;
};

const toUtcDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};

export const parseUsPolicyRate = (legacyCsv: string, upperCsv: string, lowerCsv: string): UsPolicyRatePoint[] => {
  // 單一目標值那段：上下限存同一個數字
  const daily: { date: string; upper: number; lower: number }[] = parseFredRows(legacyCsv, LEGACY_TARGET_SERIES).map(([date, v]) => ({
    date,
    upper: v,
    lower: v,
  }));

  // 區間那段：上下限要按日期配對。以上限為主，下限用 Map 查——某一天只有一邊有值就跳過那天，
  // 存半個區間比沒有更糟。
  const lowerByDate = new Map(parseFredRows(lowerCsv, RANGE_LOWER_SERIES));
  for (const [date, upper] of parseFredRows(upperCsv, RANGE_UPPER_SERIES)) {
    const lower = lowerByDate.get(date);
    if (lower === undefined) continue;
    daily.push({ date, upper, lower });
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));

  const points: UsPolicyRatePoint[] = [];
  let prev: { upper: number; lower: number } | null = null;
  for (const row of daily) {
    if (prev && prev.upper === row.upper && prev.lower === row.lower) continue;
    points.push({ effectiveDate: toUtcDate(row.date), targetUpper: row.upper, targetLower: row.lower });
    prev = { upper: row.upper, lower: row.lower };
  }
  return points;
};
