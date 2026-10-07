export interface MonthlyFiveMajorBankRatePoint {
  year: number; // 西元年
  month: number; // 1-12
  // 三個都是百分比數字（1.70 代表 1.70%，不是小數）。2026-10-07 實測整份 476 列零缺值，所以三欄
  // 都不是 nullable；parser 仍然會跳過出現 "-" 的列（CBC 的缺值標記），不猜值也不補 0。
  depositRate1m: number; // 一個月期定存利率
  depositRate1y: number; // 一年期定存利率
  baseLendingRate: number; // 基準放款利率
}
