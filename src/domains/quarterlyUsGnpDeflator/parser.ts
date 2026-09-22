import type { QuarterlyUsGnpDeflatorPoint } from '@/domains/quarterlyUsGnpDeflator/types';

export const FRED_SERIES_ID = 'GNPDEF';

// CSV 是兩欄：observation_date,GNPDEF；季資料的日期落在該季第一天（01-01/04-01/07-01/10-01）。用表頭
// 驗證序列代碼沒被換掉，日期不是季首日的列拋錯而不是猜——FRED 同一個序列代碼不會改頻率，真的出現就是
// 格式變了。缺值標記 "." 跳過。
export const parseQuarterlyUsGnpDeflator = (csv: string): QuarterlyUsGnpDeflatorPoint[] => {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0];
  if (header !== `observation_date,${FRED_SERIES_ID}`) {
    throw new Error(`FRED ${FRED_SERIES_ID} CSV 表頭不符（收到「${header}」），格式可能已變更。`);
  }

  const points: QuarterlyUsGnpDeflatorPoint[] = [];
  for (const line of lines.slice(1)) {
    const [date, rawValue] = line.split(',');
    if (!date || rawValue === undefined) continue;

    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) continue;
    const month = Number(match[2]);
    if (![1, 4, 7, 10].includes(month) || match[3] !== '01') {
      throw new Error(`FRED ${FRED_SERIES_ID} 出現非季首日的日期「${date}」，序列頻率可能已變更。`);
    }

    if (rawValue.trim() === '.') continue; // FRED 缺值標記
    const indexValue = Number(rawValue);
    if (Number.isNaN(indexValue)) continue;

    points.push({ year: Number(match[1]), quarter: (month - 1) / 3 + 1, indexValue });
  }

  return points;
};
