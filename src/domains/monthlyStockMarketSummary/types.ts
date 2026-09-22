export interface MonthlyStockMarketSummaryPoint {
  year: number; // 西元年
  month: number; // 1-12
  listedCompanies: number; // 上市公司家數
  totalParValue: number; // 上市股票總面值，百萬新台幣
  totalMarketValue: number; // 上市股票總市值，百萬新台幣
  totalTradingValue: number; // 當月總成交值，百萬新台幣
  avgDailyTradingValue: number | null; // 日均成交值，百萬新台幣；1987-1988 早期缺值
  avgTaiex: number; // 加權股價指數月平均（1966 = 100）
  avgTaiexYoyPercent: number | null; // 月平均指數年增率 %，資料起始 12 個月為 null
}
