import { describe, it, expect } from 'vitest';
import { parseQuarterlyGdp } from '@/domains/quarterlyGdp/parser';

const obs = (item: string, timePeriod: string, freq: string, type: string, value: string): string =>
  `<Obs><Item>${item}</Item><TIME_PERIOD>${timePeriod}</TIME_PERIOD><FREQ>${freq}</FREQ><TYPE>${type}</TYPE><Item_VALUE>${value}</Item_VALUE></Obs>`;

describe('parseQuarterlyGdp', () => {
  it('merges 原始值 and 年增率(%) for the same period+category into one point', () => {
    const xml = obs('經濟成長率(百分點)', '1981Q1', 'Q', '原始值', '7.19') + obs('經濟成長率(百分點)', '1981Q1', 'Q', '年增率(%)', '-9.1');
    expect(parseQuarterlyGdp(xml)).toEqual([{ year: 1981, quarter: 1, category: 'growth_rate', contributionPoints: 7.19, yoyChangePercent: -9.1 }]);
  });

  it('maps all twelve real category strings correctly', () => {
    const items: Array<[string, string]> = [
      ['經濟成長率(百分點)', 'growth_rate'],
      ['國內需求-小計(百分點)', 'domestic_demand_total'],
      ['國內需求-民間消費(百分點)', 'private_consumption'],
      ['國內需求-政府消費(百分點)', 'government_consumption'],
      ['國內需求-固定資本形成(百分點)', 'fixed_capital_formation_total'],
      ['國內需求-固定資本形成-民間(百分點)', 'fixed_capital_formation_private'],
      ['國內需求-固定資本形成-公營(百分點)', 'fixed_capital_formation_public_enterprise'],
      ['國內需求-固定資本形成-政府(百分點)', 'fixed_capital_formation_government'],
      ['國內需求-存貨變動(百分點)', 'inventory_change'],
      ['國外淨需求-小計(百分點)', 'net_external_demand_total'],
      ['國外淨需求-商品及服務輸出(百分點)', 'exports'],
      ['國外淨需求-減：商品及服務輸入(百分點)', 'imports'],
    ];
    const xml = items.map(([item]) => obs(item, '1981Q1', 'Q', '原始值', '1')).join('');
    const points = parseQuarterlyGdp(xml);
    expect(points.map((p) => p.category).sort()).toEqual(items.map(([, category]) => category).sort());
  });

  it('skips FREQ values other than Q (this domain is quarter-only)', () => {
    const xml = obs('經濟成長率(百分點)', '1981M01', 'M', '原始值', '7.19');
    expect(parseQuarterlyGdp(xml)).toEqual([]);
  });

  it('throws on an unrecognized Item string instead of guessing or dropping it', () => {
    const xml = obs('未知項目(百分點)', '1981Q1', 'Q', '原始值', '7.19');
    expect(() => parseQuarterlyGdp(xml)).toThrow(/對照表以外的項目「未知項目\(百分點\)」/);
  });

  it('treats an empty Item_VALUE as null, not zero', () => {
    const xml = obs('經濟成長率(百分點)', '1981Q1', 'Q', '年增率(%)', '');
    expect(parseQuarterlyGdp(xml)).toEqual([{ year: 1981, quarter: 1, category: 'growth_rate', contributionPoints: null, yoyChangePercent: null }]);
  });
});
