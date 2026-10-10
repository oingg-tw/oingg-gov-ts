import type { BusinessCycleReferenceDatePoint } from '@/domains/businessCycleReferenceDate/types';

// 開放資料（data.gov.tw 39486）落後國發會自己公告時，用國發會原始公告補上缺的欄位——使用者
// 2026-10-10 裁定可以這麼做。規則：
// - 只補資料集**留空**的欄位；資料集有值就以資料集為準。兩者不一致時記 log，不默默覆蓋。
// - 每一列記下補了哪些欄位、補自哪份公告（supplementedFields / supplementSource），下游永遠分得出
//   哪些是資料集原值、哪些是公告補的。
// - 公告要核對國發會原始頁面，不是媒體轉述。
// 資料集哪天跟上了，那些欄位就不再有空可補，supplementedFields 自然變空——這份清單不需要手動拿掉，
// 但可以在確認資料集已更新後刪掉對應的條目保持乾淨。

type SupplementableField = 'troughStart' | 'peak' | 'troughEnd' | 'expansionMonths' | 'contractionMonths' | 'totalMonths';

interface Supplement {
  cycleNo: number;
  values: Partial<Pick<BusinessCycleReferenceDatePoint, SupplementableField>>;
  source: string;
}

const month = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));

const NDC_2025_02_05 =
  '國發會新聞稿 2025-02-05「臺灣第15次景氣循環谷底認定為2023年4月」https://www.ndc.gov.tw/cp.aspx?n=33B5157708BB13F1&s=50B9C124498A93C6';

export const SUPPLEMENTS: Supplement[] = [
  // 原文：「認定臺灣第15次景氣循環谷底為2023年4月，收縮期為15個月，整體第15次景氣循環共歷時86個月」
  { cycleNo: 15, values: { troughEnd: month(2023, 4), contractionMonths: 15, totalMonths: 86 }, source: NDC_2025_02_05 },
  // 原文：「臺灣景氣於2023年4月達第15次景氣循環谷底後，目前已邁入第16次景氣循環」——第 16 循環的起點
  // 就是第 15 循環的谷底。高峰尚未認定，月數國發會沒公布，都留 null。
  { cycleNo: 16, values: { troughStart: month(2023, 4) }, source: NDC_2025_02_05 },
];

export interface SupplementedPoint extends BusinessCycleReferenceDatePoint {
  supplementedFields: string[];
  supplementSource: string | null;
}

const sameValue = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

export const applySupplements = (
  points: BusinessCycleReferenceDatePoint[],
  supplements: Supplement[] = SUPPLEMENTS,
  warn: (message: string) => void = console.warn
): SupplementedPoint[] => {
  const byCycle = new Map<number, SupplementedPoint>(
    points.map((p) => [p.cycleNo, { ...p, supplementedFields: [], supplementSource: null }])
  );

  for (const s of supplements) {
    let row = byCycle.get(s.cycleNo);
    if (!row) {
      // 資料集根本沒有這一列（例如還沒加上的新循環）：整列由公告建立，起點一定要有。
      if (!s.values.troughStart) {
        warn(`景氣循環補值：第 ${s.cycleNo} 循環不在資料集裡，而補值沒有 troughStart，無法建立這一列，已略過。`);
        continue;
      }
      row = {
        cycleNo: s.cycleNo, troughStart: s.values.troughStart, peak: null, troughEnd: null,
        expansionMonths: null, contractionMonths: null, totalMonths: null,
        supplementedFields: [], supplementSource: null,
      };
      byCycle.set(s.cycleNo, row);
      row.supplementedFields.push('troughStart');
      row.supplementSource = s.source;
    }

    for (const [field, value] of Object.entries(s.values) as [SupplementableField, Date | number][]) {
      if (row.supplementedFields.includes(field)) continue; // 上面建列時已經填過
      const current = row[field];
      if (current === null || current === undefined) {
        (row as unknown as Record<string, unknown>)[field] = value;
        row.supplementedFields.push(field);
        row.supplementSource = s.source;
      } else if (!sameValue(current, value)) {
        warn(`景氣循環補值：第 ${s.cycleNo} 循環的 ${field} 資料集與公告不一致（資料集 ${String(current)}，公告 ${String(value)}），以資料集為準。`);
      }
    }
  }

  return [...byCycle.values()].sort((a, b) => a.cycleNo - b.cycleNo);
};
