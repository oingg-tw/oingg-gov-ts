import { normalizeLicenseNo } from '@/adapters/mol/client';
import type { LaborBrokerEvaluationPoint } from '@/domains/laborBrokerEvaluation/types';

export const MOL_RESOURCE_ID = 'A17020000J-000001-buF'; // data.gov.tw/dataset/9332 的 CSV

const EXPECTED_HEADER =
  '年度,許可證號,公司名稱,區域,地址,品質管理（統計數值）,違規處分（統計數值）,顧客服務（統計數值）,其他事項（統計數值）,總成績（統計數值）,停業處分及申報暫停營業,重大違法行為';

const toNumberOrNull = (raw: string | undefined): number | null => {
  const v = (raw ?? '').trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
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
    if (f.length !== 12) continue;

    // 原始年度是民國年（108/109/111/112/113——110 年沒辦評鑑，資料本來就跳號）。這個 repo 其他
    // domain 一律存西元年，這裡跟著轉，不要讓下游還得自己判斷是哪種紀年。
    const rocYear = Number((f[0] ?? '').trim());
    if (!Number.isInteger(rocYear) || rocYear < 1 || rocYear > 200) continue;
    const year = rocYear + 1911;

    const licenseNo = normalizeLicenseNo((f[1] ?? '').trim());
    if (licenseNo === '') continue;

    const key = `${year}-${licenseNo}`;
    if (seen.has(key)) continue;
    seen.add(key);

    points.push({
      year,
      licenseNo,
      companyName: (f[2] ?? '').trim(),
      region: (f[3] ?? '').trim(),
      address: (f[4] ?? '').trim(),
      qualityScore: toNumberOrNull(f[5]),
      violationScore: toNumberOrNull(f[6]),
      customerServiceScore: toNumberOrNull(f[7]),
      otherScore: toNumberOrNull(f[8]),
      totalScore: toNumberOrNull(f[9]),
      hasSuspension: (f[10] ?? '').trim().toUpperCase() === 'Y',
      hasMajorViolation: (f[11] ?? '').trim().toUpperCase() === 'Y',
    });
  }

  return points;
};
