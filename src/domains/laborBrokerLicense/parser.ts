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

// 統一編號是手填欄位：實測（2026-11-03，4983 列）有 93 列空白、10 列單一字元佔位（X、Y、y、ｎ）、
// 2 列位數不足的數字（37999、7058779）、1 列 00000000，都當成沒有統編存 null。其他寫法（例如加了
// 分隔號）丟錯——之前是「不是 8 碼就存 null」，來源改格式的話整欄會安靜變成 null。
const toTaxId = (raw: string | undefined, field: string): string | null => {
  const v = (raw ?? '').trim();
  if (/^\d{8}$/.test(v) && !/^0+$/.test(v)) return v;
  if (v.length <= 1 || /^\d{1,8}$/.test(v)) return null;
  throw new Error(`${field}：無法解析的統一編號「${raw}」，來源格式可能已變更。`);
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
    if (f.length !== 15) throw new Error(`勞動部許可名冊有一列是 ${f.length} 欄（預期 15），來源格式可能已變更：「${line.slice(0, 80)}」`);

    const rawLicenseNo = (f[0] ?? '').trim();
    if (rawLicenseNo === '') throw new Error(`勞動部許可名冊有一列沒有許可證號：「${line.slice(0, 80)}」`);
    const licenseNo = normalizeLicenseNo(rawLicenseNo);
    if (seen.has(licenseNo)) throw new Error(`勞動部許可名冊的許可證號 ${rawLicenseNo} 重複出現，不知道該留哪一筆。`);
    seen.add(licenseNo);

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
      taxId: toTaxId(f[5], `${at} 公司統一編號`),
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
