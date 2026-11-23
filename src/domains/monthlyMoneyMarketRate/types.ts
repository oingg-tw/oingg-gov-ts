// 央行貨幣市場利率表 EG41M01en 全部 21 欄（2026-11-23 起收：網頁前端要畫長短天期利差，十年期公債次級市場減商業本票
// 31～90 天，從 1994-12 起連續）。商業本票、可轉讓定存單 1987-05 起每月都有；國庫券初級市場、銀行承兌匯票有空月。
export type MoneyMarketRateCategory =
  | 'interbank_call_loan' // 金融業拆款
  | 'commercial_paper_primary_1_30d' // 商業本票-初級市場
  | 'commercial_paper_primary_31_90d'
  | 'commercial_paper_primary_91_180d'
  | 'commercial_paper_secondary_1_30d' // 商業本票-次級市場
  | 'commercial_paper_secondary_31_90d'
  | 'commercial_paper_secondary_91_180d'
  | 'negotiable_cd_secondary_1_90d' // 可轉讓定期存單-次級市場
  | 'negotiable_cd_secondary_91_180d'
  | 'bankers_acceptance_secondary_1_30d' // 銀行承兌匯票-次級市場
  | 'bankers_acceptance_secondary_31_90d'
  | 'bankers_acceptance_secondary_91_180d'
  | 'treasury_bill_primary_1_91d' // 國庫券-初級市場
  | 'treasury_bill_primary_92_182d'
  | 'treasury_bill_primary_183_364d'
  | 'treasury_bill_secondary_1_30d' // 國庫券-次級市場
  | 'treasury_bill_secondary_31_91d'
  | 'treasury_bill_secondary_92_182d'
  | 'gov_bond_repo_1_30d' // 公債附條件交易利率-次級市場
  | 'gov_bond_repo_31_90d'
  | 'gov_bond_repo_91_180d';

export interface MonthlyMoneyMarketRatePoint {
  year: number; // 西元年
  month: number; // 1-12
  category: MoneyMarketRateCategory;
  rate: number; // 年息百分比，1.234 代表 1.234%
}
