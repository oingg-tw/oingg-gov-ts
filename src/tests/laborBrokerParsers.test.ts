import { describe, it, expect } from 'vitest';
import { parseLaborBrokerLicense } from '@/domains/laborBrokerLicense/parser';
import { parseLaborBrokerEvaluation } from '@/domains/laborBrokerEvaluation/parser';
import { normalizeLicenseNo } from '@/adapters/mol/client';

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

  it('stores a null tax id for the placeholders the real file uses, and throws on anything else', () => {
    const row = (no: string, tax: string) => `${no},測試,臺北市,02-1,王小明,${tax},0,0,20200101,20220101,,,,,`;
    const csv = [LIC_HEADER, ...['', 'X', 'ｎ', '37999', '00000000'].map((tax, i) => row(String(i + 1), tax))].join('\n');
    expect(parseLaborBrokerLicense(csv).map((p) => p.taxId)).toEqual([null, null, null, null, null]);
    expect(() => parseLaborBrokerLicense(`${LIC_HEADER}\n${row('9', '8683-2290')}`)).toThrow(/公司統一編號.*無法解析的統一編號/);
  });

  it('throws on a duplicated or missing licence number instead of silently keeping one row', () => {
    const row = (no: string) => `${no},測試,臺北市,02-1,王小明,86832290,0,0,20200101,20220101,,,,,`;
    expect(() => parseLaborBrokerLicense([LIC_HEADER, row('0007'), row('7')].join('\n'))).toThrow(/許可證號 7 重複出現/);
    expect(() => parseLaborBrokerLicense([LIC_HEADER, row('')].join('\n'))).toThrow(/沒有許可證號/);
  });

  it('keeps the revoked/terminated dates that make a licence invalid', () => {
    const csv = `${LIC_HEADER}\n0001,允啟開發有限公司,臺北市,02-27276999,李心玲,86486468,0,2,20061020,20081019,,,,20070119,\n`;
    const [p] = parseLaborBrokerLicense(csv);
    expect(p!.terminatedDate).toEqual(new Date(Date.UTC(2007, 0, 19)));
  });

  it('stores blank address, phone and responsible person as null, not ""', () => {
    const csv = `${LIC_HEADER}\n0011,測試三,,,,86832290,0,0,20200101,20220101,,,,,\n`;
    expect(parseLaborBrokerLicense(csv)[0]).toMatchObject({ address: null, phone: null, responsiblePerson: null });
  });

  it('throws on a malformed date or headcount instead of storing null', () => {
    const row = (date: string, staff: string) => `${LIC_HEADER}\n0012,測試四,臺北市,02-3,王,86832290,0,${staff},${date},20220101,,,,,\n`;
    expect(() => parseLaborBrokerLicense(row('2020/01/01', '0'))).toThrow(/許可證起始日.*無法解析的日期/);
    expect(() => parseLaborBrokerLicense(row('20201320', '0'))).toThrow(/無法解析的日期/);
    expect(() => parseLaborBrokerLicense(row('20200101', '12人'))).toThrow(/從業人員人數.*無法解析的數字/);
    expect(() => parseLaborBrokerLicense(row('20200101', '2.5'))).toThrow(/不是整數/);
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

  it('keeps one row per (year, licence) and throws on a repeat instead of silently keeping the first', () => {
    const csv = `${EVAL_HEADER}\n113,7,甲公司,臺北市,路一,1,1,1,1,4,N,N\n112,7,甲公司,臺北市,路一,2,2,2,2,8,N,N\n`;
    expect(parseLaborBrokerEvaluation(csv).map((p) => `${p.year}-${p.licenseNo}`)).toEqual(['2024-7', '2023-7']);
    const repeated = `${EVAL_HEADER}\n113,7,甲公司,臺北市,路一,1,1,1,1,4,N,N\n113,0007,甲公司,臺北市,路一,9,9,9,9,36,N,N\n`;
    expect(() => parseLaborBrokerEvaluation(repeated)).toThrow(/113 年許可證號 7 重複出現/);
  });

  it('throws on an unreadable ROC year', () => {
    expect(() => parseLaborBrokerEvaluation(`${EVAL_HEADER}\n一一三,7,甲,臺北市,路一,1,1,1,1,4,N,N\n`)).toThrow(/無法解析的民國年度「一一三」/);
  });

  it('throws on a Y/N flag that is neither Y nor N, or a score that is not a number', () => {
    expect(() => parseLaborBrokerEvaluation(`${EVAL_HEADER}\n113,7,甲,臺北市,路一,1,1,1,1,4,,N\n`)).toThrow(/預期 Y／N/);
    expect(() => parseLaborBrokerEvaluation(`${EVAL_HEADER}\n113,7,甲,臺北市,路一,1,--,1,1,4,N,N\n`)).toThrow(/違規處分.*無法解析的數字/);
  });

  it('throws when the header changes', () => {
    expect(() => parseLaborBrokerEvaluation('年度,許可證號\n108,2\n')).toThrow(/表頭不符/);
  });
});
