import { parseDgbasObsXml } from '@/adapters/dgbas/client';
import type { GdpExpenditureCategory, QuarterlyGdpExpenditurePoint } from '@/domains/quarterlyGdpExpenditure/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// Item 是「<值的種類>、<項目>」，例如「連鎖實質值(2021為參考年_新臺幣百萬元)、1.民間消費」（2026-11-23 用真實檔案核對過：
// 3 種 × 17 項 = 51 個 Item，182 季）。值的種類用前綴比對，撐過換參考年；項目用完整字串比對，沒見過的丟錯。
const MEASURES = [
  ['當期價格', 'nominal'],
  ['連鎖實質值', 'real'],
  ['平減指數', 'deflator'],
] as const;
type Measure = (typeof MEASURES)[number][1];

const COMPONENTS: Readonly<Record<string, GdpExpenditureCategory>> = {
  '1.民間消費': 'private_consumption',
  '2.政府消費': 'government_consumption',
  '3.資本形成:3.1--3.2合計': 'capital_formation_total',
  '3.1固定資本形成': 'fixed_capital_formation_total',
  '3.2存貨變動': 'inventory_change',
  '4.商品及服務輸出:4.1--4.2合計': 'exports',
  '4.1商品、運輸與保險': 'exports_goods',
  '4.2其他': 'exports_other',
  '5.商品及服務輸入:5.1--5.2合計': 'imports',
  '5.1商品、運輸與保險': 'imports_goods',
  '5.2其他': 'imports_other',
  '6.國內需求': 'domestic_demand_total',
  '7.國外淨需求': 'net_external_demand_total',
  '8.GDP': 'gdp',
  '9.國外要素所得淨額': 'net_factor_income_from_abroad',
  '10.對外貿易條件變動損益': 'terms_of_trade_gains_losses',
  '11.GNI': 'gni',
};

type ValueField = Exclude<keyof QuarterlyGdpExpenditurePoint, 'year' | 'quarter' | 'category'>;
const FIELDS: Record<Measure, { value: ValueField; yoy: ValueField }> = {
  nominal: { value: 'nominalAmountMillionNtd', yoy: 'nominalYoyPercent' },
  real: { value: 'realAmountMillionNtd', yoy: 'realYoyPercent' },
  deflator: { value: 'deflatorIndex', yoy: 'deflatorYoyPercent' },
};

const describeItem = (item: string): { measure: Measure; category: GdpExpenditureCategory } => {
  const sep = item.indexOf('、');
  const measure = MEASURES.find(([prefix]) => item.startsWith(prefix))?.[1];
  const category = sep === -1 ? undefined : COMPONENTS[item.slice(sep + 1).trim()];
  if (!measure || !category) throw new Error(`主計總處 GDP 依支出分出現沒對照過的項目「${item}」，格式可能已變更。`);
  return { measure, category };
};

export const parseQuarterlyGdpExpenditure = (xml: string): QuarterlyGdpExpenditurePoint[] => {
  const obsList = parseDgbasObsXml(xml).filter((obs) => obs.freq === 'Q');
  const items = new Map([...new Set(obsList.map((obs) => obs.item))].map((item) => [item, describeItem(item)]));
  const expected = MEASURES.length * Object.keys(COMPONENTS).length;
  if (items.size !== expected) throw new Error(`主計總處 GDP 依支出分有 ${items.size} 個項目，跟預期的 ${expected} 個不符，格式可能已變更。`);

  const points = new Map<string, QuarterlyGdpExpenditurePoint>();
  for (const obs of obsList) {
    const match = obs.timePeriod.match(/^(\d{4})Q([1-4])$/);
    if (!match) continue; // 同 quarterlyGdp：不是季資料的期間不收
    if (obs.type !== '原始值' && obs.type !== '年增率(%)') continue; // 其他 TYPE 不收，同 monthlyCpi
    const { measure, category } = items.get(obs.item)!;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const key = `${year}Q${quarter}-${category}`;

    const value = parseSourceNumber(obs.value, [''], `主計總處 GDP 依支出分 ${key} ${obs.item} ${obs.type}`);
    if (value === null) continue;
    let point = points.get(key);
    if (!point) {
      point = {
        year,
        quarter,
        category,
        nominalAmountMillionNtd: null,
        nominalYoyPercent: null,
        realAmountMillionNtd: null,
        realYoyPercent: null,
        deflatorIndex: null,
        deflatorYoyPercent: null,
      };
      points.set(key, point);
    }
    const field = obs.type === '原始值' ? FIELDS[measure].value : FIELDS[measure].yoy;
    // 金額欄是 Decimal(14,0)：有小數會被四捨五入，所以先擋下來（實測都是整數）
    if (field.endsWith('MillionNtd') && !Number.isInteger(value)) {
      throw new Error(`主計總處 GDP 依支出分 ${key} ${obs.item} 的金額「${value}」有小數，跟以往的整數不同，格式可能已變更。`);
    }
    point[field] = value;
  }
  return [...points.values()];
};
