import type { MonthlyUnemploymentRatePoint, UnemploymentCategory } from '@/domains/monthlyUnemploymentRate/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// 這份檔案跟 monthlyCpi/quarterlyGdp 用的 DataSet/Obs 格式完全不同，是攤平的
// <DataCollection><失業率><年月別_Year_and_month>...</...>...</失業率>...</DataCollection>，每個
// 欄位各自是一個 XML 標籤（標籤名稱本身就帶中文字，例如 age_15-19_百分比），不是用 <TYPE>/<Item>
// 這種泛用鍵值對包起來的，所以不能重用 adapters/dgbas/client.ts 的 parseDgbasObsXml，這裡另外寫。
// 已用真實檔案核對過（2026-09-02）：632 筆 <失業率> 區塊，每筆 22 個子欄位，regex 全部解析成功。
const RECORD_REGEX = /<失業率>([\s\S]*?)<\/失業率>/g;
const FIELD_REGEX = /<([^\s<>/]+)>([^<]*)<\/\1>/g;

// 標籤名稱 → category 的對照表，已用真實檔案核對過全部 21 個（2026-09-02）。
const FIELD_CATEGORY_MAP: Readonly<Record<string, UnemploymentCategory>> = {
  總計_Total_百分比: 'total',
  男_Male_百分比: 'male',
  女_Female_百分比: 'female',
  'age_15-19_百分比': 'age_15_19',
  'age_20-24_百分比': 'age_20_24',
  'age_25-29_百分比': 'age_25_29',
  'age_30-34_百分比': 'age_30_34',
  'age_35-39_百分比': 'age_35_39',
  'age_40-44_百分比': 'age_40_44',
  'age_45-49_百分比': 'age_45_49',
  'age_50-54_百分比': 'age_50_54',
  'age_55-59_百分比': 'age_55_59',
  'age_60-64_百分比': 'age_60_64',
  age_65_over_百分比: 'age_65_over',
  國中及以下_Junior_high_and_below_百分比: 'edu_junior_high_and_below',
  國小及以下_Primary_school_and_below_百分比: 'edu_primary_school_and_below',
  國中_Junior_high_百分比: 'edu_junior_high',
  高級中等_高中_高職__Senior_high_school__regular_and_vocational__百分比: 'edu_senior_high',
  大專及以上_Junior_college_and_above_百分比: 'edu_college_and_above',
  專科_Junior_college_百分比: 'edu_junior_college',
  大學及以上_University_and_above_百分比: 'edu_university_and_above',
};

export const parseMonthlyUnemploymentRate = (xml: string): MonthlyUnemploymentRatePoint[] => {
  const points: MonthlyUnemploymentRatePoint[] = [];

  for (const recordMatch of xml.matchAll(RECORD_REGEX)) {
    const body = recordMatch[1] ?? '';
    const fields = new Map<string, string>();
    for (const fieldMatch of body.matchAll(FIELD_REGEX)) {
      fields.set(fieldMatch[1] ?? '', fieldMatch[2] ?? '');
    }

    const period = fields.get('年月別_Year_and_month');
    if (!period) continue;

    // 第一列是年度摘要（只有西元年、沒有月份，例如單獨的 "1978"），之後才是逐月資料——年度摘要列
    // 不收，這個 domain 只存月資料。
    const match = period.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);

    for (const [fieldName, category] of Object.entries(FIELD_CATEGORY_MAP)) {
      const raw = fields.get(fieldName);
      if (raw === undefined) continue; // 這一列沒有這個欄位，不寫入（不是 0）
      // "-" 是尚未統計的月份（2026-11-03 實測：1978 年的 65 歲以上），之前被 Number.isNaN 默默跳過
      const ratePercent = parseSourceNumber(raw, ['', '-'], `主計總處失業率 ${period} ${fieldName}`);
      if (ratePercent === null) continue; // 缺值，不寫入（不是 0）
      points.push({ year, month, category, ratePercent });
    }
  }

  return points;
};
