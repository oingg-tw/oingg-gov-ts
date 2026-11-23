// 資本市場利率表 EG43M01en 的 20 欄（2026-11-23 起全存：網頁前端要做殖利率曲線，使用者說總經相關的都要用）。
// 除了 gov_bond_10y_secondary_market，其他欄只有當月有發行才有值（應該是發行利率），例如 3 年期公債全部只有 11 個月。
export type CapitalMarketRateCategory =
  | 'gov_bond_3y'
  | 'gov_bond_5y'
  | 'gov_bond_7y'
  | 'gov_bond_10y'
  | 'gov_bond_15y'
  | 'corporate_bond_1y'
  | 'corporate_bond_2y'
  | 'corporate_bond_3y'
  | 'corporate_bond_4y'
  | 'corporate_bond_5y'
  | 'corporate_bond_6y'
  | 'corporate_bond_7y'
  | 'corporate_bond_10y'
  | 'bank_debenture_2y'
  | 'bank_debenture_3y'
  | 'bank_debenture_5y'
  | 'cbc_cd_1y' // 央行定期存單
  | 'cbc_cd_2y'
  | 'cbc_savings_bond_1y' // 央行儲蓄券（來源寫 SB），只有 1987-05～1989-04
  | 'gov_bond_10y_secondary_market'; // 十年期政府公債次級市場利率，同 MonthlyGovBondYield10yPoint

export interface MonthlyCapitalMarketRatePoint {
  year: number; // 西元年
  month: number; // 1-12
  category: CapitalMarketRateCategory;
  rate: number; // 年息百分比，1.234 代表 1.234%
}

export interface MonthlyGovBondYield10yPoint {
  year: number; // 西元年
  month: number; // 1-12
  yieldRate: number; // 10年期政府公債次級市場殖利率（百分比，例如 1.234 代表 1.234%，不是小數）
}
