import { describe, it, expect } from 'vitest';
import { parseMonthlyCpi, parseMonthlyCpiItems } from '@/domains/monthlyCpi/parser';

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

const BASE = '(指數基期：民國110年=100)';
// 每項兩個 TYPE，照真實檔案的排法：一項的所有期別排完才換下一項。
const item = (label: string, period: string, index: string, yoy: string) =>
  obs(label + BASE, period, 'M', '原始值', index) + obs(label + BASE, period, 'M', '年增率(%)', yoy);

describe('parseMonthlyCpiItems', () => {
  it('keeps every item with its major category, parent and official order', () => {
    const xml =
      item('總指數', '2026M10', '108.5', '1.2') +
      item('一.食物類', '2026M10', '112.3', '2.5') +
      item('1.穀類及其製品', '2026M10', '110.0', '0.8') +
      item('(1)米類及其製品', '2026M10', '111.1', '0.5') +
      item('2.肉類', '2026M10', '115.0', '3.0') +
      item('二.衣著類', '2026M10', '101.0', '-0.2') +
      item('1.成衣', '2026M10', '100.5', '-0.4');
    const points = parseMonthlyCpiItems(xml);
    expect(points.map((p) => [p.itemName, p.category, p.parentItemName, p.itemOrder])).toEqual([
      ['總指數', 'total', null, 1],
      ['食物類', 'food', '總指數', 2],
      ['穀類及其製品', 'food', '食物類', 3],
      ['米類及其製品', 'food', '穀類及其製品', 4],
      ['肉類', 'food', '食物類', 5],
      ['衣著類', 'clothing', '總指數', 6],
      ['成衣', 'clothing', '衣著類', 7],
    ]);
    expect(points[3]).toMatchObject({ year: 2026, month: 10, indexValue: 111.1, yoyChangePercent: 0.5 });
  });

  it('skips an item-month where both values are empty, keeps one where only yoy is empty', () => {
    const xml = item('總指數', '1981M01', '52.95', '') + item('一.食物類', '1981M01', '', '');
    const points = parseMonthlyCpiItems(xml);
    expect(points).toEqual([
      { year: 1981, month: 1, itemName: '總指數', category: 'total', parentItemName: null, itemOrder: 1, indexValue: 52.95, yoyChangePercent: null },
    ]);
  });

  it('throws on a numbering format it has never seen', () => {
    expect(() => parseMonthlyCpiItems(item('總指數', '2026M10', '1', '1') + item('一.食物類', '2026M10', '1', '1') + item('A.其他', '2026M10', '1', '1'))).toThrow(
      /編號格式沒見過/
    );
  });

  it('throws on a third-level item with no second-level item before it', () => {
    expect(() => parseMonthlyCpiItems(item('一.食物類', '2026M10', '1', '1') + item('(1)米類及其製品', '2026M10', '1', '1'))).toThrow(/前面沒有上一層/);
  });

  it('throws when two items end up with the same name (item_name is part of the key)', () => {
    const xml = item('一.食物類', '2026M10', '1', '1') + item('1.其他', '2026M10', '1', '1') + item('2.其他', '2026M10', '1', '1');
    expect(() => parseMonthlyCpiItems(xml)).toThrow(/空的或重複/);
  });

  it('throws on a major category it has never mapped', () => {
    expect(() => parseMonthlyCpiItems(item('八.其他類', '2026M10', '1', '1'))).toThrow(/沒對照過的大類/);
  });
});
