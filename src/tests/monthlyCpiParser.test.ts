import { describe, it, expect } from 'vitest';
import { parseMonthlyCpi } from '@/domains/monthlyCpi/parser';

const obs = (item: string, timePeriod: string, freq: string, type: string, value: string): string =>
  `<Obs><Item>${item}</Item><TIME_PERIOD>${timePeriod}</TIME_PERIOD><FREQ>${freq}</FREQ><TYPE>${type}</TYPE><Item_VALUE>${value}</Item_VALUE></Obs>`;

describe('parseMonthlyCpi', () => {
  it('merges 原始值 and 年增率(%) for the same period+category into one point', () => {
    const xml =
      obs('總指數(指數基期：民國110年=100)', '1981M01', 'M', '原始值', '52.95') +
      obs('總指數(指數基期：民國110年=100)', '1981M01', 'M', '年增率(%)', '3.5');
    expect(parseMonthlyCpi(xml)).toEqual([{ year: 1981, month: 1, category: 'total', indexValue: 52.95, yoyChangePercent: 3.5 }]);
  });

  it('maps all seven top-level category prefixes correctly', () => {
    const items: Array<[string, string]> = [
      ['一.食物類(指數基期：民國110年=100)', 'food'],
      ['二.衣著類(指數基期：民國110年=100)', 'clothing'],
      ['三.居住類(指數基期：民國110年=100)', 'housing'],
      ['四.交通及通訊類(指數基期：民國110年=100)', 'transport_communication'],
      ['五.醫藥保健類(指數基期：民國110年=100)', 'medical'],
      ['六.教養娛樂類(指數基期：民國110年=100)', 'education_recreation'],
      ['七.雜項類(指數基期：民國110年=100)', 'misc'],
    ];
    const xml = items.map(([item]) => obs(item, '1981M01', 'M', '原始值', '100')).join('');
    const points = parseMonthlyCpi(xml);
    expect(points.map((p) => p.category).sort()).toEqual(items.map(([, category]) => category).sort());
  });

  it('excludes sub-items that are not one of the eight tracked categories (real file has 81 total)', () => {
    // "1.穀類及其製品" 是「一.食物類」底下的細項，用阿拉伯數字開頭，不該被當成大類食物本身。
    const xml = obs('1.穀類及其製品(指數基期：民國110年=100)', '1981M01', 'M', '原始值', '50');
    expect(parseMonthlyCpi(xml)).toEqual([]);
  });

  it('treats an empty Item_VALUE as null, not zero', () => {
    const xml = obs('總指數', '1981M01', 'M', '年增率(%)', '');
    expect(parseMonthlyCpi(xml)).toEqual([{ year: 1981, month: 1, category: 'total', indexValue: null, yoyChangePercent: null }]);
  });

  it('skips FREQ values other than M (this domain is month-only)', () => {
    const xml = obs('總指數', '1981Q1', 'Q', '原始值', '52.95');
    expect(parseMonthlyCpi(xml)).toEqual([]);
  });

  it('skips a TIME_PERIOD that does not match YYYYMmm', () => {
    const xml = obs('總指數', 'not-a-period', 'M', '原始值', '52.95');
    expect(parseMonthlyCpi(xml)).toEqual([]);
  });

  it('throws on a non-numeric Item_VALUE instead of storing null', () => {
    const xml = obs('總指數', '1981M01', 'M', '原始值', 'N/A');
    expect(() => parseMonthlyCpi(xml)).toThrow(/無法解析的數字「N\/A」/);
  });
});
