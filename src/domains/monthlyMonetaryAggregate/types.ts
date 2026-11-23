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

// EF15M01en 全部 15 項（2026-11-23 起另存長表 monthly_monetary_aggregate_component：網頁前端要在 M2 頁畫組成）。
// M1A＝通貨＋支票存款＋活期存款；M1B＝M1A＋活期儲蓄存款；M2＝M1B＋準貨幣。
export type MonetaryAggregateComponentCategory =
  | 'currency_held_by_public' // 貨幣機構以外各部門持有通貨（通貨淨額）
  | 'deposit_money_total' // 存款貨幣-計
  | 'checking_deposits' // 支票存款
  | 'passbook_deposits' // 活期存款
  | 'passbook_savings_deposits' // 活期儲蓄存款
  | 'quasi_money_total' // 準貨幣-計
  | 'time_and_savings_deposits' // 定期及定期儲蓄存款
  | 'foreign_currency_deposits' // 外匯存款
  | 'postal_savings_deposits' // 郵政儲金
  | 'non_resident_ntd_deposits' // 外國人新台幣存款
  | 'repurchase_agreements' // 附買回交易餘額
  | 'money_market_funds' // 貨幣市場共同基金等
  | 'm1a'
  | 'm1b'
  | 'm2';

export interface MonthlyMonetaryAggregateComponentPoint {
  year: number; // 西元年
  month: number; // 1-12
  category: MonetaryAggregateComponentCategory;
  amountMillionNtd: number; // 百萬新台幣，日平均；來源都是整數（解析時檢查）
  yoyChangePercent: number | null; // 年增率 %
}
