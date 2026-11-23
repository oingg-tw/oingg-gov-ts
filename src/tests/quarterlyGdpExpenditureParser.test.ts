import { describe, it, expect } from 'vitest';
import { parseQuarterlyGdpExpenditure } from '@/domains/quarterlyGdpExpenditure/parser';

const obs = (item: string, period: string, type: string, value: string) =>
  `<Obs><Item>${item}</Item><TIME_PERIOD>${period}</TIME_PERIOD><FREQ>Q</FREQ><TYPE>${type}</TYPE>\n<Item_VALUE>${value}</Item_VALUE></Obs>`;

// 名稱照真實檔案（2026-11-23）：3 種值 × 17 項
const MEASURES = ['當期價格(新臺幣百萬元)', '連鎖實質值(2021為參考年_新臺幣百萬元)', '平減指數(2021年=100)'];
const COMPONENTS = [
  '1.民間消費', '2.政府消費', '3.資本形成:3.1--3.2合計', '3.1固定資本形成', '3.2存貨變動', '4.商品及服務輸出:4.1--4.2合計',
  '4.1商品、運輸與保險', '4.2其他', '5.商品及服務輸入:5.1--5.2合計', '5.1商品、運輸與保險', '5.2其他', '6.國內需求', '7.國外淨需求',
  '8.GDP', '9.國外要素所得淨額', '10.對外貿易條件變動損益', '11.GNI',
];
// 每個 Item 一季兩個 Obs；override 用「種類序號、項目」指定值，其餘填 100 / 1.5
const file = (override: Record<string, [string, string]> = {}, components = COMPONENTS) =>
  MEASURES.flatMap((m, mi) =>
    components.map((c) => {
      const [value, yoy] = override[`${mi}、${c}`] ?? ['100', '1.5'];
      return obs(`${m}、${c}`, '2026Q2', '原始值', value) + obs(`${m}、${c}`, '2026Q2', '年增率(%)', yoy);
    })
  ).join('');

describe('parseQuarterlyGdpExpenditure', () => {
  it('folds the three measures of a component into one row', () => {
    const points = parseQuarterlyGdpExpenditure(
      file({ '0、4.商品及服務輸出:4.1--4.2合計': ['7261588', '30.1'], '1、4.商品及服務輸出:4.1--4.2合計': ['5796654', '21.24'], '2、4.商品及服務輸出:4.1--4.2合計': ['125.27', '7.4'] })
    );
    expect(points).toHaveLength(17);
    expect(points.find((p) => p.category === 'exports')).toEqual({
      year: 2026,
      quarter: 2,
      category: 'exports',
      nominalAmountMillionNtd: 7261588,
      nominalYoyPercent: 30.1,
      realAmountMillionNtd: 5796654,
      realYoyPercent: 21.24,
      deflatorIndex: 125.27,
      deflatorYoyPercent: 7.4,
    });
  });

  it('stores null where the source is empty (inventory change has no yoy or deflator)', () => {
    const points = parseQuarterlyGdpExpenditure(file({ '1、3.2存貨變動': ['-142121', ''], '2、3.2存貨變動': ['', ''] }));
    expect(points.find((p) => p.category === 'inventory_change')).toMatchObject({ realAmountMillionNtd: -142121, realYoyPercent: null, deflatorIndex: null, deflatorYoyPercent: null });
  });

  it('throws on a component it has never mapped', () => {
    expect(() => parseQuarterlyGdpExpenditure(file({}, [...COMPONENTS.slice(1), '12.其他']))).toThrow(/沒對照過的項目/);
  });

  it('throws when an item disappears', () => {
    expect(() => parseQuarterlyGdpExpenditure(file({}, COMPONENTS.slice(1)))).toThrow(/跟預期的 51 個不符/);
  });

  it('throws on an amount with decimals, since the column would round it', () => {
    expect(() => parseQuarterlyGdpExpenditure(file({ '0、8.GDP': ['8060904.5', '1'] }))).toThrow(/有小數/);
  });
});
