import { describe, it, expect } from 'vitest';
import { parseFundDailyNav } from '@/domains/fundDailyNav/parser';

const HEADER = '日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號';

describe('parseFundDailyNav', () => {
  it('parses a real ETF row (2026-09-11 verified against the live SITCA file)', () => {
    const csv = `${HEADER}\n20260909,A0001,兆豐投信,00512527,DIE02,兆豐美國企業優選投資級公司債ETF基金,12.8325,-0.0495,-0.38426,AH22,TWD,00957B`;
    expect(parseFundDailyNav(csv)).toEqual([
      {
        tradeDate: new Date(Date.UTC(2026, 8, 9)),
        memberCode: 'A0001',
        companyName: '兆豐投信',
        fundTaxId: '00512527',
        fundCode: 'DIE02',
        fundName: '兆豐美國企業優選投資級公司債ETF基金',
        navValue: 12.8325,
        changeValue: -0.0495,
        changePercent: -0.38426,
        typeCode: 'AH22',
        currency: 'TWD',
        beneficiaryCode: '00957B',
      },
    ]);
  });

  it('treats "-" nav/change fields as null, not zero (real file has such rows for illiquid funds)', () => {
    const csv = `${HEADER}\n20260909,A0004,滙豐投信,25695077M,DIOB2,某基金,-,-,-,AC21,USD,T0440N`;
    const points = parseFundDailyNav(csv);
    expect(points[0]?.navValue).toBeNull();
    expect(points[0]?.changeValue).toBeNull();
    expect(points[0]?.changePercent).toBeNull();
  });

  it('skips a row with an empty beneficiary code', () => {
    const csv = `${HEADER}\n20260909,A0001,兆豐投信,00512527,DIE02,某基金,12.8,0,0,AH22,TWD,`;
    expect(parseFundDailyNav(csv)).toEqual([]);
  });

  it('does not treat fund_code as unique — two different funds may share the same fund_code on the same day (real file case)', () => {
    // 這個測試只驗證 parser 不會因為 fund_code 重複而漏解析——真正的去重/唯一鍵是在 service.ts 用
    // (trade_date, beneficiary_code) 處理，不是 parser 的職責。
    const csv = `${HEADER}
20260909,A0001,兆豐投信,00526748A,DIOB2,兆豐ESG台美永續雙盈多重資產基金(新台幣)-累積型,13.56,-0.04,-0.29412,AJ2,TWD,T0138A
20260909,A0003,第一金投信,88132717G,DIOB2,第一金四至六年機動到期全球富裕國家投資級債券基金-累積型-南非幣,11.2957,0.006,0.05315,AC21,ZAR,T0362G`;
    const points = parseFundDailyNav(csv);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.beneficiaryCode)).toEqual(['T0138A', 'T0362G']);
  });

  it('skips a row with a malformed date field', () => {
    const csv = `${HEADER}\nnot-a-date,A0001,兆豐投信,00512527,DIE02,某基金,12.8,0,0,AH22,TWD,00957B`;
    expect(parseFundDailyNav(csv)).toEqual([]);
  });

  it('throws when the header does not match (format changed)', () => {
    const csv = '日期,SomeOtherColumn\n20260909,1';
    expect(() => parseFundDailyNav(csv)).toThrow(/表頭欄位/);
  });
});
