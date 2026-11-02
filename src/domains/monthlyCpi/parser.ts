import { parseDgbasObsXml } from '@/adapters/dgbas/client';
import type { CpiCategory, MonthlyCpiPoint } from '@/domains/monthlyCpi/types';
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
