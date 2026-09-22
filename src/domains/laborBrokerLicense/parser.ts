import { normalizeLicenseNo, parseMolDate } from '@/adapters/mol/client';
import type { LaborBrokerLicensePoint } from '@/domains/laborBrokerLicense/types';

export const MOL_RESOURCE_ID = 'A17000000J-020001-NEH'; // data.gov.tw/dataset/6682 的 CSV

const EXPECTED_HEADER =
  '許可證,機構名稱,機構地址,電話,負責人姓名,公司統一編號,專業人員人數,從業人員人數,許可證起始日,許可證終止日,停業起始日,停業屆滿日,預訂復業日期,終止營業日期,廢止許可日期';

const toIntOrNull = (raw: string | undefined): number | null => {
  const v = (raw ?? '').trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

export const parseLaborBrokerLicense = (csv: string): LaborBrokerLicensePoint[] => {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines[0] !== EXPECTED_HEADER) {
    throw new Error(`勞動部跨國人力仲介許可名冊 CSV 表頭不符（收到「${lines[0]}」），格式可能已變更。`);
  }

  // 同一個統編可能有多張許可證（換證、多分支），所以主鍵是許可證號不是統編。
  const points: LaborBrokerLicensePoint[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (f.length !== 15) continue; // 欄位數不符的列跳過而不是猜——實測全檔都是 15 欄

    const rawLicenseNo = (f[0] ?? '').trim();
    if (rawLicenseNo === '') continue;
    const licenseNo = normalizeLicenseNo(rawLicenseNo);
    if (seen.has(licenseNo)) continue; // 防衛：同一許可證號重複出現時只留第一筆
    seen.add(licenseNo);

    const rawTaxId = (f[5] ?? '').trim();

    points.push({
      licenseNo,
      rawLicenseNo,
      agencyName: (f[1] ?? '').trim(),
      address: (f[2] ?? '').trim(),
      phone: (f[3] ?? '').trim(),
      responsiblePerson: (f[4] ?? '').trim(),
      taxId: /^\d{8}$/.test(rawTaxId) ? rawTaxId : null,
      professionalStaffCount: toIntOrNull(f[6]),
      staffCount: toIntOrNull(f[7]),
      licenseStartDate: parseMolDate(f[8]),
      licenseEndDate: parseMolDate(f[9]),
      suspensionStartDate: parseMolDate(f[10]),
      suspensionEndDate: parseMolDate(f[11]),
      expectedResumeDate: parseMolDate(f[12]),
      terminatedDate: parseMolDate(f[13]),
      revokedDate: parseMolDate(f[14]),
    });
  }

  return points;
};
