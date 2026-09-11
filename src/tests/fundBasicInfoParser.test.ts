import { describe, it, expect } from 'vitest';
import { parseFundBasicInfo } from '@/domains/fundBasicInfo/parser';

const HEADER =
  '年月,公司名稱,基金名稱,統編,基金/級別成立日期,基金規模日期,基金規模幣別,基金級別規模_金額,基金規模(依基金別)_金額,基金類型別,投資地區,基金配息規定(基金收益分配規定),基金ISIN Code,保管銀行(國內),保管銀行(國外),基金計價幣別';

describe('parseFundBasicInfo', () => {
  it('parses a real ETF row (2026-09-11 verified against the live SITCA file)', () => {
    const csv = `${HEADER}\n202607,兆豐投信,兆豐美國企業優選投資級公司債ETF基金,00512527,20240829,20260731,台幣,2497021022,2497021022,(AH22) 跨國投資指數股票型_債券型,美國及其他標的指數成分債之國家或地區,月配息,TW00000957B0,臺灣銀行股份有限公司,美商道富銀行股份有限公司,TWD`;
    expect(parseFundBasicInfo(csv)).toEqual([
      {
        year: 2026,
        month: 7,
        companyName: '兆豐投信',
        fundName: '兆豐美國企業優選投資級公司債ETF基金',
        fundTaxId: '00512527',
        fundInceptionDate: '20240829',
        fundSizeDate: '20260731',
        fundSizeCurrency: '台幣',
        classSizeAmount: 2497021022,
        fundSizeAmount: 2497021022,
        fundType: '(AH22) 跨國投資指數股票型_債券型',
        investmentRegion: '美國及其他標的指數成分債之國家或地區',
        dividendPolicy: '月配息',
        isinCode: 'TW00000957B0',
        custodianDomestic: '臺灣銀行股份有限公司',
        custodianForeign: '美商道富銀行股份有限公司',
        denominationCurrency: 'TWD',
      },
    ]);
  });

  it('skips a row with an empty ISIN Code (real file has 1 such row out of 4433)', () => {
    const csv = `${HEADER}\n202607,某投信,某基金,12345678,20200101,20260731,台幣,100,100,類型,國內,不配息,,保管銀行,,TWD`;
    expect(parseFundBasicInfo(csv)).toEqual([]);
  });

  it('treats "-" and empty amount fields as null, not zero', () => {
    const csv = `${HEADER}\n202607,某投信,某基金,12345678,20200101,20260731,台幣,-,,類型,國內,不配息,TW0000000000,保管銀行,,TWD`;
    const points = parseFundBasicInfo(csv);
    expect(points[0]?.classSizeAmount).toBeNull();
    expect(points[0]?.fundSizeAmount).toBeNull();
  });

  it('treats empty custodian fields as null', () => {
    const csv = `${HEADER}\n202607,某投信,某基金,12345678,20200101,20260731,台幣,100,100,類型,國內,不配息,TW0000000000,,,TWD`;
    const points = parseFundBasicInfo(csv);
    expect(points[0]?.custodianDomestic).toBeNull();
    expect(points[0]?.custodianForeign).toBeNull();
  });

  it('skips a row with a malformed year-month field', () => {
    const csv = `${HEADER}\nnot-a-yearmonth,某投信,某基金,12345678,20200101,20260731,台幣,100,100,類型,國內,不配息,TW0000000000,保管銀行,,TWD`;
    expect(parseFundBasicInfo(csv)).toEqual([]);
  });

  it('throws when the header does not match (format changed)', () => {
    const csv = '年月,SomeOtherColumn\n202607,1';
    expect(() => parseFundBasicInfo(csv)).toThrow(/表頭欄位/);
  });

  it('skips a row with the wrong field count', () => {
    const csv = `${HEADER}\n202607,too,few,fields`;
    expect(parseFundBasicInfo(csv)).toEqual([]);
  });
});
