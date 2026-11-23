import { parseDgbasObsXml } from '@/adapters/dgbas/client';
import type { CpiCategory, MonthlyCpiItemPoint, MonthlyCpiPoint } from '@/domains/monthlyCpi/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// 用 Item 欄位的前綴比對，不比對完整字串——官方原始值是「總指數(指數基期：民國110年=100)」這種
// 「名稱+基期標註」組合字串，基期標註在官方換基期年時會變（例如以後可能改成「民國115年=100」），
// 用前綴比對可以撐過換基期，不用等改版壞掉才發現。大類用中文數字「一.」~「七.」開頭，跟底下細項
// 用阿拉伯數字「1.」/「(1)」開頭的格式不會撞在一起，不用擔心比對到錯的層級。
const CATEGORY_PREFIXES: ReadonlyArray<readonly [string, CpiCategory]> = [
  ['總指數', 'total'],
  ['一.食物類', 'food'],
  ['二.衣著類', 'clothing'],
  ['三.居住類', 'housing'],
  ['四.交通及通訊類', 'transport_communication'],
  ['五.醫藥保健類', 'medical'],
  ['六.教養娛樂類', 'education_recreation'],
  ['七.雜項類', 'misc'],
];

const findCategory = (item: string): CpiCategory | null => {
  const found = CATEGORY_PREFIXES.find(([prefix]) => item.startsWith(prefix));
  return found ? found[1] : null;
};

// 已用真實回應核對過（2026-09-02）：CPI 檔案裡每個 Item 在同一個 TIME_PERIOD 下有兩個 Obs（TYPE=
// "原始值" 跟 TYPE="年增率(%)"），這裡合併成一個 point。Item_VALUE 空字串代表官方缺值（通常出現在
// 資料起始年份附近，年增率沒有前一年可比較），存 null，不是 0。
export const parseMonthlyCpi = (xml: string): MonthlyCpiPoint[] => {
  const points = new Map<string, MonthlyCpiPoint>();

  for (const obs of parseDgbasObsXml(xml)) {
    if (obs.freq !== 'M') continue;

    const match = obs.timePeriod.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue;

    const category = findCategory(obs.item);
    if (!category) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const key = `${year}-${month}-${category}`;

    let point = points.get(key);
    if (!point) {
      point = { year, month, category, indexValue: null, yoyChangePercent: null };
      points.set(key, point);
    }

    const value = parseSourceNumber(obs.value, [''], `主計總處 CPI ${key} ${obs.type}`);
    if (value === null) continue; // 缺值，維持 null

    if (obs.type === '原始值') point.indexValue = value;
    else if (obs.type === '年增率(%)') point.yoyChangePercent = value;
    // 其他 TYPE 值目前沒在真實回應裡出現過，忽略即可——不是這個 domain 要的欄位
  }

  return [...points.values()];
};

type CpiItemMeta = Pick<MonthlyCpiItemPoint, 'itemName' | 'category' | 'parentItemName' | 'itemOrder'>;

const BASE_YEAR_NOTE = /\(指數基期：[^)]*\)\s*$/;

// 81 項的階層照官方編號推：「一.」~「七.」是大類（對照 CATEGORY_PREFIXES）、「1.」是大類底下一層、「(1)」是再下一層。
// 檔案裡的項目就照這個順序排（2026-11-23 用 11-12 的銅層檔核對過），所以第一次出現的順序就是官方順序，
// 也推得出上一層。編號格式沒見過、層級接不上、或兩項同名（itemName 是主鍵的一部分）都丟錯，不猜。
const describeCpiItems = (items: string[]): Map<string, CpiItemMeta> => {
  const metas = new Map<string, CpiItemMeta>();
  const names = new Set<string>();
  let major: { name: string; category: CpiCategory } | null = null;
  let mid: string | null = null;
  items.forEach((raw, i) => {
    const label = raw.replace(BASE_YEAR_NOTE, '').trim();
    const itemOrder = i + 1;
    let meta: CpiItemMeta;
    let m: RegExpMatchArray | null;
    if (label === '總指數') {
      meta = { itemName: label, category: 'total', parentItemName: null, itemOrder };
    } else if ((m = label.match(/^[一二三四五六七八九十]+\.(.+)$/))) {
      const category = findCategory(label);
      if (!category || category === 'total') throw new Error(`主計總處 CPI 出現沒對照過的大類「${raw}」，格式可能已變更。`);
      major = { name: (m[1] ?? '').trim(), category };
      mid = null;
      meta = { itemName: major.name, category, parentItemName: '總指數', itemOrder };
    } else if ((m = label.match(/^\d+\.(.+)$/))) {
      if (!major) throw new Error(`主計總處 CPI 項目「${raw}」出現在任何大類之前，格式可能已變更。`);
      mid = (m[1] ?? '').trim();
      meta = { itemName: mid, category: major.category, parentItemName: major.name, itemOrder };
    } else if ((m = label.match(/^\(\d+\)(.+)$/))) {
      if (!major || !mid) throw new Error(`主計總處 CPI 項目「${raw}」前面沒有上一層，格式可能已變更。`);
      meta = { itemName: (m[1] ?? '').trim(), category: major.category, parentItemName: mid, itemOrder };
    } else {
      throw new Error(`主計總處 CPI 項目「${raw}」的編號格式沒見過，格式可能已變更。`);
    }
    if (!meta.itemName || names.has(meta.itemName)) throw new Error(`主計總處 CPI 項目名稱「${meta.itemName}」是空的或重複，格式可能已變更。`);
    names.add(meta.itemName);
    metas.set(raw, meta);
  });
  return metas;
};

// 檔案裡全部 81 項（含總指數和七大類，數字跟 parseMonthlyCpi 相同），一個（月, 項目）一列。
// 指數和年增率都是空字串的（那項當時還沒開始編）不存列。
export const parseMonthlyCpiItems = (xml: string): MonthlyCpiItemPoint[] => {
  const obsList = parseDgbasObsXml(xml).filter((obs) => obs.freq === 'M');
  const metas = describeCpiItems([...new Set(obsList.map((obs) => obs.item))]);

  const points = new Map<string, MonthlyCpiItemPoint>();
  for (const obs of obsList) {
    const match = obs.timePeriod.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue; // 同 parseMonthlyCpi
    const meta = metas.get(obs.item);
    if (!meta) continue; // 不會發生：metas 就是從 obsList 建的
    const year = Number(match[1]);
    const month = Number(match[2]);
    const key = `${year}-${month}-${meta.itemName}`;
    if (obs.type !== '原始值' && obs.type !== '年增率(%)') continue; // 其他 TYPE 同 parseMonthlyCpi 不收

    const value = parseSourceNumber(obs.value, [''], `主計總處 CPI ${key} ${obs.type}`);
    if (value === null) continue;

    let point = points.get(key);
    if (!point) {
      point = { year, month, ...meta, indexValue: null, yoyChangePercent: null };
      points.set(key, point);
    }
    if (obs.type === '原始值') point.indexValue = value;
    else point.yoyChangePercent = value;
  }
  return [...points.values()];
};
