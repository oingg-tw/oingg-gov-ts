import type { MonthlyBusinessCycleIndicatorPoint } from '@/domains/monthlyBusinessCycleIndicator/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// 已用真實檔案核對過（2026-09-02）：UTF-8 with BOM，表頭欄位帶雙引號，資料列不帶引號、也沒有內含
// 逗號的欄位，直接用逗號分割就夠，不需要處理引號轉義（跟 fia/client.ts 的營業稅籍登記 CSV 不同，
// 那份地址/名稱欄位常帶逗號才需要專門的 CSV parser）。
const HEADER = 'Date,領先指標綜合指數,領先指標不含趨勢指數,同時指標綜合指數,同時指標不含趨勢指數,落後指標綜合指數,落後指標不含趨勢指數,景氣對策信號綜合分數,景氣對策信號';

// "-" 是國發會這份檔案的缺值標記（實測發現在 1980 年代初期資料裡出現，景氣對策信號綜合分數/燈號
// 那兩欄尚未開始統計的月份），跟 CBC 用同一個標記但含義互不相關，這裡各自獨立處理。景氣對策信號
// 燈號文字有時帶尾隨空白（實測驗證過 "黃藍 " 這個真實值），trim() 掉。
const parseNumericField = (raw: string): number | null => parseSourceNumber(raw, ['', '-'], '國發會景氣指標');

export const parseMonthlyBusinessCycleIndicator = (csv: string): MonthlyBusinessCycleIndicatorPoint[] => {
  // 去掉 BOM（U+FEFF），跟表頭比對用的字串才不會因為第一個欄位帶隱藏字元而永遠比對不上。
  const withoutBom = csv.replace(/^﻿/, '');
  const lines = withoutBom.split(/\r?\n/).filter((line) => line.trim() !== '');

  const headerLine = lines[0]?.replace(/"/g, '');
  if (headerLine !== HEADER) {
    throw new Error('國發會景氣指標與燈號.csv 的表頭欄位跟預期不符，格式可能已變更。');
  }

  const points: MonthlyBusinessCycleIndicatorPoint[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(',');
    if (fields.length !== 9) throw new Error(`國發會景氣指標與燈號有一列是 ${fields.length} 欄（預期 9），來源格式可能已變更：「${line.slice(0, 80)}」`);

    const dateField = fields[0] ?? '';
    const match = dateField.match(/^(\d{4})(\d{2})$/);
    if (!match) throw new Error(`國發會景氣指標與燈號：無法解析的年月「${dateField}」（預期西元 YYYYMM），來源格式可能已變更。`);

    points.push({
      year: Number(match[1]),
      month: Number(match[2]),
      leadingIndexComposite: parseNumericField(fields[1] ?? ''),
      leadingIndexDetrended: parseNumericField(fields[2] ?? ''),
      coincidentIndexComposite: parseNumericField(fields[3] ?? ''),
      coincidentIndexDetrended: parseNumericField(fields[4] ?? ''),
      laggingIndexComposite: parseNumericField(fields[5] ?? ''),
      laggingIndexDetrended: parseNumericField(fields[6] ?? ''),
      signalScore: parseNumericField(fields[7] ?? ''),
      signalLight: (() => {
        const trimmed = (fields[8] ?? '').trim();
        return trimmed === '' || trimmed === '-' ? null : trimmed;
      })(),
    });
  }

  return points;
};
