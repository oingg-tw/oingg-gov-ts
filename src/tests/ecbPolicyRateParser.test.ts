import { describe, it, expect } from 'vitest';
import { parseEcbPolicyRate } from '@/domains/ecbPolicyRate/parser';

// ECB csvdata 的表頭欄位順序會隨 dataflow 變，parser 按名稱找 index——測試也照真實格式擺，
// 順便釘住「按名稱找欄位」這件事。
const csv = (rows: [string, string][]): string =>
  ['KEY,FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE', ...rows.map(([d, v]) => `FM.X,D,U2,${d},${v}`)].join('\n');

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('parseEcbPolicyRate', () => {
  it('collapses daily held-constant values into one row per change', () => {
    const points = parseEcbPolicyRate(
      csv([['1999-01-01', '2.00'], ['1999-01-02', '2.00'], ['1999-01-03', '1.75']]),
      csv([['1999-01-01', '4.50'], ['1999-01-02', '4.50'], ['1999-01-03', '4.50']]),
      csv([['1999-01-01', '3.00'], ['1999-01-02', '3.00'], ['1999-01-03', '3.00']]),
      csv([['1998-12-31', '9.99']]) // 比固定利率早，一開始就被蓋過；放在之後會被當成換了標售機制
    );
    expect(points.map((p) => [iso(p.effectiveDate), p.depositFacilityRate])).toEqual([
      ['1999-01-01', 2],
      ['1999-01-03', 1.75],
    ]);
  });

  it('treats a corridor-only change (MRO unchanged) as a change', () => {
    const points = parseEcbPolicyRate(
      csv([['2019-09-17', '-0.40'], ['2019-09-18', '-0.50']]),
      csv([['2019-09-17', '0.25'], ['2019-09-18', '0.25']]),
      csv([['2019-09-17', '0.00'], ['2019-09-18', '0.00']]),
      csv([['2000-06-28', '4.25']])
    );
    expect(points).toHaveLength(2);
    expect(points[1]).toMatchObject({ depositFacilityRate: -0.5, mainRefinancingRate: 0 });
  });

  // 這是整個 parser 存在的理由：最低投標利率那段不能是 0，也不能跟固定標售利率混為一談。
  it('fills the minimum-bid-tender era from MRR_MBR and flags it', () => {
    const days: [string, string][] = [['2000-06-27', '3.25'], ['2000-06-28', '3.25']];
    const points = parseEcbPolicyRate(
      csv(days),
      csv([['2000-06-27', '5.25'], ['2000-06-28', '5.25']]),
      csv([['2000-06-27', '4.25']]),
      csv([['2000-06-28', '4.25']])
    );
    expect(points.map((p) => [iso(p.effectiveDate), p.mainRefinancingRate, p.mainRefinancingIsMinimumBid])).toEqual([
      ['2000-06-27', 4.25, false],
      ['2000-06-28', 4.25, true], // 利率數字沒變，變的是標售機制——仍然算一次事件
    ]);
  });

  it('prefers the fixed-rate series if the two MRO series ever overlap', () => {
    const [point] = parseEcbPolicyRate(
      csv([['2008-10-15', '3.25']]),
      csv([['2008-10-15', '4.25']]),
      csv([['2008-10-15', '3.75']]),
      csv([['2008-10-15', '9.99']])
    );
    expect(point).toMatchObject({ mainRefinancingRate: 3.75, mainRefinancingIsMinimumBid: false });
  });

  // 調整日序列（B 頻率，現在抓的）：各支只列自己調整的那天，沒列就是沿用。
  it('carries each rate forward between its own change dates and waits until every rate has started', () => {
    const points = parseEcbPolicyRate(
      csv([['1999-01-01', '2.00'], ['1999-04-09', '1.50']]),
      csv([['1999-01-04', '4.50'], ['1999-04-09', '3.50']]),
      csv([['1999-01-01', '3.00'], ['1999-04-09', '2.50'], ['2000-06-09', '4.25'], ['2008-10-15', '3.75']]),
      csv([['2000-06-28', '4.25'], ['2008-10-15', '']]) // 空值是 ECB 的結束標記
    );
    expect(points.map((p) => [iso(p.effectiveDate), p.depositFacilityRate, p.mainRefinancingRate, p.marginalLendingRate, p.mainRefinancingIsMinimumBid])).toEqual([
      ['1999-01-04', 2, 3, 4.5, false], // 邊際貸款利率這天才開始
      ['1999-04-09', 1.5, 2.5, 3.5, false],
      ['2000-06-09', 1.5, 4.25, 3.5, false], // 只調 MRO，其他兩支沿用
      ['2000-06-28', 1.5, 4.25, 3.5, true], // 改成變動利率標售
      ['2008-10-15', 1.5, 3.75, 3.5, false], // 回到固定利率標售
    ]);
  });

  it('throws when the CSV no longer carries the expected columns', () => {
    const broken = 'KEY,FREQ,DATE,VALUE\nFM.X,D,2026-01-01,2.00';
    expect(() => parseEcbPolicyRate(broken, csv([['2026-01-01', '2.40']]), csv([['2026-01-01', '2.15']]), csv([['2000-06-28', '4.25']]))).toThrow(
      /TIME_PERIOD/
    );
  });

  it('throws when a series comes back empty', () => {
    expect(() =>
      parseEcbPolicyRate(csv([]), csv([['2026-01-01', '2.40']]), csv([['2026-01-01', '2.15']]), csv([['2000-06-28', '4.25']]))
    ).toThrow(/沒有解析出任何觀測值/);
  });
});
