export interface MonthlyMonetaryAggregatePoint {
  year: number; // 西元年
  month: number; // 1-12
  m1aAmount: number; // 百萬新台幣
  m1aYoyPercent: number | null; // 年增率 %，資料起始年份無前一年可比時為 null
  m1bAmount: number;
  m1bYoyPercent: number | null;
  m2Amount: number;
  m2YoyPercent: number | null;
}
