import { normalizeLicenseNo } from '@/adapters/mol/client';
import type { LaborBrokerLicensePoint } from '@/domains/laborBrokerLicense/types';
import { parseSourceNumber, parseYmdDate } from '@/shared/parseSourceValue';

export const MOL_RESOURCE_ID = 'A17000000J-020001-NEH'; // data.gov.tw/dataset/6682 的 CSV

const EXPECTED_HEADER =
  '許可證,機構名稱,機構地址,電話,負責人姓名,公司統一編號,專業人員人數,從業人員人數,許可證起始日,許可證終止日,停業起始日,停業屆滿日,預訂復業日期,終止營業日期,廢止許可日期';

const toIntOrNull = (raw: string | undefined, field: string): number | null => {
  const n = parseSourceNumber(raw ?? '', [''], field);
  if (n !== null && !Number.isInteger(n)) throw new Error(`${field}：人數「${raw}」不是整數，來源格式可能已變更。`);
  return n;
};

const toNullableString = (raw: string | undefined): string | null => {
  const v = (raw ?? '').trim();
  return v === '' ? null : v;
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
    // 日期欄位都是西元 8 碼；空字串代表「沒有這個狀態」（沒停業、沒廢止），存 null
    const at = `勞動部許可名冊 ${rawLicenseNo}`;
    const date = (i: number, field: string) => parseYmdDate(f[i], `${at} ${field}`);

    points.push({
      licenseNo,
      rawLicenseNo,
      agencyName: (f[1] ?? '').trim(),
      address: toNullableString(f[2]),
      phone: toNullableString(f[3]),
      responsiblePerson: toNullableString(f[4]),
      taxId: /^\d{8}$/.test(rawTaxId) ? rawTaxId : null,
      professionalStaffCount: toIntOrNull(f[6], `${at} 專業人員人數`),
      staffCount: toIntOrNull(f[7], `${at} 從業人員人數`),
      licenseStartDate: date(8, '許可證起始日'),
      licenseEndDate: date(9, '許可證終止日'),
      suspensionStartDate: date(10, '停業起始日'),
      suspensionEndDate: date(11, '停業屆滿日'),
      expectedResumeDate: date(12, '預訂復業日期'),
      terminatedDate: date(13, '終止營業日期'),
      revokedDate: date(14, '廢止許可日期'),
    });
  }

  return points;
};
