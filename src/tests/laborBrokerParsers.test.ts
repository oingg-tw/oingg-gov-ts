import { describe, it, expect } from 'vitest';
import { parseLaborBrokerLicense } from '@/domains/laborBrokerLicense/parser';
import { parseLaborBrokerEvaluation } from '@/domains/laborBrokerEvaluation/parser';
import { normalizeLicenseNo, parseMolDate } from '@/adapters/mol/client';

const LIC_HEADER =
  '許可證,機構名稱,機構地址,電話,負責人姓名,公司統一編號,專業人員人數,從業人員人數,許可證起始日,許可證終止日,停業起始日,停業屆滿日,預訂復業日期,終止營業日期,廢止許可日期';
const EVAL_HEADER =
  '年度,許可證號,公司名稱,區域,地址,品質管理（統計數值）,違規處分（統計數值）,顧客服務（統計數值）,其他事項（統計數值）,總成績（統計數值）,停業處分及申報暫停營業,重大違法行為';

describe('normalizeLicenseNo', () => {
  it('strips leading zeros so the two MOL files join', () => {
    expect(normalizeLicenseNo('0002')).toBe('2');
    expect(normalizeLicenseNo('2')).toBe('2');
    expect(normalizeLicenseNo('0002-1')).toBe('2-1');
    expect(normalizeLicenseNo('0100')).toBe('100');
  });
});

describe('parseMolDate', () => {
  it('parses AD yyyymmdd and rejects blanks and malformed values', () => {
    expect(parseMolDate('20061020')).toEqual(new Date(Date.UTC(2006, 9, 20)));
    expect(parseMolDate('')).toBeNull();
    expect(parseMolDate(undefined)).toBeNull();
    expect(parseMolDate('2006102')).toBeNull();
    expect(parseMolDate('20061320')).toBeNull(); // 13 月
  });
});

describe('parseLaborBrokerLicense', () => {
  it('parses a real row, normalising the licence number and keeping the raw one', () => {
    const csv = `${LIC_HEADER}\n0002,證豐企業管理顧問有限公司,桃園市桃園區大興西路２段６５號１８樓,03-3018999,張建隆,86832290,5,21,20241021,20261020,,,,,\n`;
    const [p] = parseLaborBrokerLicense(csv);
    expect(p).toMatchObject({
      licenseNo: '2',
      rawLicenseNo: '0002',
      agencyName: '證豐企業管理顧問有限公司',
      taxId: '86832290',
      professionalStaffCount: 5,
      staffCount: 21,
      suspensionStartDate: null,
      terminatedDate: null,
      revokedDate: null,
    });
    expect(p!.licenseEndDate).toEqual(new Date(Date.UTC(2026, 9, 20)));
  });

  it('stores a null tax id when the field is blank or malformed', () => {
    const csv = `${LIC_HEADER}\n0009,測試有限公司,臺北市,02-1,王小明,,0,0,20200101,20220101,,,,,\n0010,測試二,臺北市,02-2,李小華,1234,0,0,20200101,20220101,,,,,\n`;
    const points = parseLaborBrokerLicense(csv);
    expect(points.map((p) => p.taxId)).toEqual([null, null]);
  });

  it('keeps the revoked/terminated dates that make a licence invalid', () => {
    const csv = `${LIC_HEADER}\n0001,允啟開發有限公司,臺北市,02-27276999,李心玲,86486468,0,2,20061020,20081019,,,,20070119,\n`;
    const [p] = parseLaborBrokerLicense(csv);
    expect(p!.terminatedDate).toEqual(new Date(Date.UTC(2007, 0, 19)));
  });

  it('throws when the header changes', () => {
    expect(() => parseLaborBrokerLicense('許可證,機構名稱\n0001,x\n')).toThrow(/表頭不符/);
  });
});

describe('parseLaborBrokerEvaluation', () => {
  it('converts the ROC year to AD and maps Y/N flags to booleans', () => {
    const csv = `${EVAL_HEADER}\n108,2,證豐企業管理顧問有限公司,桃園市桃園區,大興西路２段６５號１８樓,23,-5,52.25,11,81.25,N,Y\n`;
    const [p] = parseLaborBrokerEvaluation(csv);
    expect(p).toMatchObject({
      year: 2019,
      licenseNo: '2',
      violationScore: -5, // 違規處分可為負分
      totalScore: 81.25,
      hasSuspension: false,
      hasMajorViolation: true,
    });
  });

  it('keeps one row per (year, licence) and tolerates repeats', () => {
    const csv = `${EVAL_HEADER}\n113,7,甲公司,臺北市,路一,1,1,1,1,4,N,N\n113,0007,甲公司,臺北市,路一,9,9,9,9,36,N,N\n112,7,甲公司,臺北市,路一,2,2,2,2,8,N,N\n`;
    const points = parseLaborBrokerEvaluation(csv);
    expect(points).toHaveLength(2);
    expect(points.map((p) => `${p.year}-${p.licenseNo}`)).toEqual(['2024-7', '2023-7']);
  });

  it('throws when the header changes', () => {
    expect(() => parseLaborBrokerEvaluation('年度,許可證號\n108,2\n')).toThrow(/表頭不符/);
  });
});
