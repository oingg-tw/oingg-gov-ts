import { normalizeLicenseNo } from '@/adapters/mol/client';
import type { LaborBrokerEvaluationPoint } from '@/domains/laborBrokerEvaluation/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

export const MOL_RESOURCE_ID = 'A17020000J-000001-buF'; // data.gov.tw/dataset/9332 的 CSV

const EXPECTED_HEADER =
  '年度,許可證號,公司名稱,區域,地址,品質管理（統計數值）,違規處分（統計數值）,顧客服務（統計數值）,其他事項（統計數值）,總成績（統計數值）,停業處分及申報暫停營業,重大違法行為';

// 來源是 Y／N，其他值（含空白）丟錯——之前是「不是 Y 就當 false」，來源改寫法會安靜地全變 false。
const toBoolean = (raw: string | undefined, field: string): boolean => {
  const v = (raw ?? '').trim().toUpperCase();
  if (v === 'Y') return true;
  if (v === 'N') return false;
  throw new Error(`${field}：預期 Y／N，收到「${raw}」，來源格式可能已變更。`);
};

export const parseLaborBrokerEvaluation = (csv: string): LaborBrokerEvaluationPoint[] => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines[0] !== EXPECTED_HEADER) {
    throw new Error(`勞動部私立就業服務機構評鑑結果 CSV 表頭不符（收到「${lines[0]}」），格式可能已變更。`);
  }

  const points: LaborBrokerEvaluationPoint[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (f.length !== 12) throw new Error(`勞動部評鑑結果有一列是 ${f.length} 欄（預期 12），來源格式可能已變更：「${line.slice(0, 80)}」`);

    // 原始年度是民國年（108/109/111/112/113——110 年沒辦評鑑，資料本來就跳號）。這個 repo 其他
    // domain 一律存西元年，這裡跟著轉，不要讓下游還得自己判斷是哪種紀年。
    const rocYear = Number((f[0] ?? '').trim());
    if (!Number.isInteger(rocYear) || rocYear < 1 || rocYear > 200) throw new Error(`勞動部評鑑結果：無法解析的民國年度「${f[0]}」，來源格式可能已變更。`);
    const year = rocYear + 1911;

    const licenseNo = normalizeLicenseNo((f[1] ?? '').trim());
    if (licenseNo === '') throw new Error(`勞動部評鑑結果 ${rocYear} 年有一列沒有許可證號：「${line.slice(0, 80)}」`);

    const key = `${year}-${licenseNo}`;
    if (seen.has(key)) throw new Error(`勞動部評鑑結果 ${rocYear} 年許可證號 ${licenseNo} 重複出現，不知道該留哪一筆。`);
    seen.add(key);

    const at = `勞動部評鑑結果 ${rocYear} 年 ${licenseNo}`;
    const score = (i: number, field: string) => parseSourceNumber(f[i] ?? '', [''], `${at} ${field}`);
    points.push({
      year,
      licenseNo,
      companyName: (f[2] ?? '').trim(),
      region: (f[3] ?? '').trim(),
      address: (f[4] ?? '').trim(),
      qualityScore: score(5, '品質管理'),
      violationScore: score(6, '違規處分'),
      customerServiceScore: score(7, '顧客服務'),
      otherScore: score(8, '其他事項'),
      totalScore: score(9, '總成績'),
      hasSuspension: toBoolean(f[10], `${at} 停業處分及申報暫停營業`),
      hasMajorViolation: toBoolean(f[11], `${at} 重大違法行為`),
    });
  }

  return points;
};
