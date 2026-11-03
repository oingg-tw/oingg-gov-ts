import { parseDgbasObsXml } from '@/adapters/dgbas/client';
import type { GdpCategory, QuarterlyGdpPoint } from '@/domains/quarterlyGdp/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// 用完整字串比對，不是前綴比對（跟 monthlyCpi 不同）——GDP 這份檔案只有 12 個項目，彼此不是像 CPI
// 那樣有「大類/細項」的階層關係，完整字串比對更精確，也能在官方改了項目名稱時直接拋錯而不是誤判成
// 別的類別。已用真實回應核對過全部 12 個 key（2026-09-02）。
const CATEGORY_MAP: Readonly<Record<string, GdpCategory>> = {
  '經濟成長率(百分點)': 'growth_rate',
  '國內需求-小計(百分點)': 'domestic_demand_total',
  '國內需求-民間消費(百分點)': 'private_consumption',
  '國內需求-政府消費(百分點)': 'government_consumption',
  '國內需求-固定資本形成(百分點)': 'fixed_capital_formation_total',
  '國內需求-固定資本形成-民間(百分點)': 'fixed_capital_formation_private',
  '國內需求-固定資本形成-公營(百分點)': 'fixed_capital_formation_public_enterprise',
  '國內需求-固定資本形成-政府(百分點)': 'fixed_capital_formation_government',
  '國內需求-存貨變動(百分點)': 'inventory_change',
  '國外淨需求-小計(百分點)': 'net_external_demand_total',
  '國外淨需求-商品及服務輸出(百分點)': 'exports',
  '國外淨需求-減：商品及服務輸入(百分點)': 'imports',
};

// 跟 monthlyCpi 一樣，每個 Item 在同一個 TIME_PERIOD 下有兩個 Obs（TYPE="原始值" 跟 "年增率(%)"），
// 合併成一個 point。
export const parseQuarterlyGdp = (xml: string): QuarterlyGdpPoint[] => {
  const points = new Map<string, QuarterlyGdpPoint>();

  for (const obs of parseDgbasObsXml(xml)) {
    if (obs.freq !== 'Q') continue;

    const match = obs.timePeriod.match(/^(\d{4})Q([1-4])$/);
    if (!match) continue;

    const category = CATEGORY_MAP[obs.item];
    if (!category) throw new Error(`主計總處 GDP 出現對照表以外的項目「${obs.item}」，官方可能改了項目名稱。`);

    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const key = `${year}-${quarter}-${category}`;

    let point = points.get(key);
    if (!point) {
      point = { year, quarter, category, contributionPoints: null, yoyChangePercent: null };
      points.set(key, point);
    }

    const value = parseSourceNumber(obs.value, [''], `主計總處 GDP ${key} ${obs.type}`);
    if (value === null) continue;

    if (obs.type === '原始值') point.contributionPoints = value;
    else if (obs.type === '年增率(%)') point.yoyChangePercent = value;
  }

  return [...points.values()];
};
