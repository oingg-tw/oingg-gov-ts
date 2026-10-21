import type { BusinessCycleReferenceDatePoint } from '@/domains/businessCycleReferenceDate/types';

// 開放資料（data.gov.tw 39486）落後國發會自己公告時，用國發會原始公告補上缺的欄位——使用者
// 2026-10-10 裁定可以這麼做。規則：
// - 只補資料集**留空**的欄位；資料集有值就以資料集為準。兩者不一致時記 log，不默默覆蓋。
// - 每一列記下補了哪些欄位、補自哪份公告（supplementedFields / supplementSource），下游永遠分得出
//   哪些是資料集原值、哪些是公告補的。
// - 公告要核對國發會原始頁面，不是媒體轉述。
// 資料集哪天跟上了，那些欄位就不再有空可補，supplementedFields 自然變空——這份清單不需要手動拿掉，
// 但可以在確認資料集已更新後刪掉對應的條目保持乾淨。
//
// **更正（使用者 2026-10-21 另外核准）**：資料集**有值但值是錯的**、而官方公告明確推翻它時，才用公告蓋掉。
// 這跟補值不同，所以每一條更正都寫明「資料集現在的錯誤值」：資料集的值等於它才改；資料集已經修好
// （等於公告值）就什麼都不做；變成第三個值就不動、記 log 讓人來看——不會拿一條過時的更正蓋掉新資料。
// 更正過的欄位一樣記在 supplementedFields / supplementSource，下游的判讀方式不變：有列在
// supplementedFields 裡的欄位，值來自公告，不是資料集原值。

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

interface Correction {
  cycleNo: number;
  field: SupplementableField;
  datasetValue: Date | number; // 資料集現在的錯誤值，只有等於它才更正
  value: Date | number; // 公告的正確值
  source: string;
}

const NDC_2016_01_18 =
  '國發會新聞稿 2016-01-18「認定臺灣第14次景氣循環高峰為2014年10月」https://www.ndc.gov.tw/cp.aspx?n=80D78933E4B6C963&s=FD598757E4A1CCB8';

export const CORRECTIONS: Correction[] = [
  // 資料集寫 201401，國發會公告是 2014 年 10 月（看起來是 201410 末兩碼打反）。同一列自己的月數也印證：
  // 谷底 2012-01 加擴張期 33 個月是 2014-10，再加收縮期 16 個月正好是谷底 2016-02；照 2014-01 算則是
  // 擴張 24、收縮 25，兩個都對不上。2018 年的第 14 次谷底認定新聞稿也寫「高峰…認定在2014年10月」。
  // analysis-ts／web-nuxt 2026-10-21 發現，gov-ts 核對國發會兩份原始新聞稿後更正。
  { cycleNo: 14, field: 'peak', datasetValue: month(2014, 1), value: month(2014, 10), source: NDC_2016_01_18 },
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
  warn: (message: string) => void = console.warn,
  corrections: Correction[] = CORRECTIONS
): SupplementedPoint[] => {
  const byCycle = new Map<number, SupplementedPoint>(
    points.map((p) => [p.cycleNo, { ...p, supplementedFields: [], supplementSource: null }])
  );

  for (const c of corrections) {
    const row = byCycle.get(c.cycleNo);
    if (!row) continue;
    const current = row[c.field];
    if (sameValue(current, c.value)) continue; // 資料集已經修好
    if (!sameValue(current, c.datasetValue)) {
      warn(`景氣循環更正：第 ${c.cycleNo} 循環的 ${c.field} 不是預期的錯誤值（資料集 ${String(current)}，預期 ${String(c.datasetValue)}），不更正，請人工確認。`);
      continue;
    }
    (row as unknown as Record<string, unknown>)[c.field] = c.value;
    row.supplementedFields.push(c.field);
    row.supplementSource = c.source;
  }

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
