import type { BusinessCycleReferenceDatePoint } from '@/domains/businessCycleReferenceDate/types';

const EXPECTED_HEADER = '循環次序,谷底1(日期),高峰(日期),谷底2(日期),擴張期,收縮期,全循環';

const toMonthDate = (raw: string, field: string, line: string): Date | null => {
  const v = raw.trim();
  if (v === '') return null; // 尚未認定
  const match = v.match(/^(\d{4})(\d{2})$/);
  if (!match) throw new Error(`國發會景氣循環峰谷日期「${field}」不是 YYYYMM（「${v}」，列「${line}」），格式可能已變更。`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
};

const toMonths = (raw: string, field: string, line: string): number | null => {
  const v = raw.trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`國發會景氣循環峰谷日期「${field}」不是整數月數（「${v}」，列「${line}」）。`);
  return n;
};

// 2026-10-10 實測格式：表頭一列、15 列「第N循環」、最後一列「平均」（只有三個月數的平均值）。
// 「平均」是彙總列不是循環，跳過——下游要平均自己算，這裡只落地事實。
export const parseBusinessCycleReferenceDates = (csv: string): BusinessCycleReferenceDatePoint[] => {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines[0]?.replace(/\s/g, '') !== EXPECTED_HEADER) {
    throw new Error(`國發會景氣循環峰谷日期 CSV 表頭不符（收到「${lines[0]}」），格式可能已變更。`);
  }

  const points: BusinessCycleReferenceDatePoint[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const label = (cells[0] ?? '').trim();
    if (label === '平均') continue;
    const match = label.match(/^第(\d+)循環$/);
    if (!match) throw new Error(`國發會景氣循環峰谷日期出現無法辨識的列「${line}」，格式可能已變更。`);

    const troughStart = toMonthDate(cells[1] ?? '', '谷底1', line);
    if (!troughStart) throw new Error(`國發會景氣循環峰谷日期第 ${match[1]} 循環缺少谷底1（「${line}」）。`);
    points.push({
      cycleNo: Number(match[1]),
      troughStart,
      peak: toMonthDate(cells[2] ?? '', '高峰', line),
      troughEnd: toMonthDate(cells[3] ?? '', '谷底2', line),
      expansionMonths: toMonths(cells[4] ?? '', '擴張期', line),
      contractionMonths: toMonths(cells[5] ?? '', '收縮期', line),
      totalMonths: toMonths(cells[6] ?? '', '全循環', line),
    });
  }
  if (points.length === 0) throw new Error('國發會景氣循環峰谷日期 CSV 沒有任何循環資料。');
  return points;
};
