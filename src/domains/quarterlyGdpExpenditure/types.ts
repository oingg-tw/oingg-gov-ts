// 主計總處「國內生產毛額及平減指數依支出分-季」（na8102a6q.xml，1981Q1 起）的 17 個項目（2026-11-23 起收：網頁前端的 GDP 頁
// 要各項目的實質成長率，就是連鎖實質值的年增率）。代碼跟 v_quarterly_gdps（貢獻度）同一個概念的用同一個。
export type GdpExpenditureCategory =
  | 'private_consumption' // 1.民間消費
  | 'government_consumption' // 2.政府消費
  | 'capital_formation_total' // 3.資本形成（3.1＋3.2）
  | 'fixed_capital_formation_total' // 3.1 固定資本形成
  | 'inventory_change' // 3.2 存貨變動
  | 'exports' // 4.商品及服務輸出（4.1＋4.2）
  | 'exports_goods' // 4.1 商品、運輸與保險
  | 'exports_other' // 4.2 其他
  | 'imports' // 5.商品及服務輸入（5.1＋5.2）
  | 'imports_goods' // 5.1 商品、運輸與保險
  | 'imports_other' // 5.2 其他
  | 'domestic_demand_total' // 6.國內需求
  | 'net_external_demand_total' // 7.國外淨需求
  | 'gdp' // 8.GDP
  | 'net_factor_income_from_abroad' // 9.國外要素所得淨額
  | 'terms_of_trade_gains_losses' // 10.對外貿易條件變動損益
  | 'gni'; // 11.GNI

// 一季一個項目一列。三組值各帶年增率；來源是空字串的存 null（例如存貨變動、國外淨需求沒有年增率和平減指數）。
export interface QuarterlyGdpExpenditurePoint {
  year: number; // 西元年
  quarter: number; // 1-4
  category: GdpExpenditureCategory;
  nominalAmountMillionNtd: number | null; // 當期價格，新台幣百萬元
  nominalYoyPercent: number | null;
  realAmountMillionNtd: number | null; // 連鎖實質值（參考年見來源標註，目前 2021），新台幣百萬元
  realYoyPercent: number | null; // 實質成長率 %
  deflatorIndex: number | null; // 平減指數（目前 2021 = 100）
  deflatorYoyPercent: number | null;
}
