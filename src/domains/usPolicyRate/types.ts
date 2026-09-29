export interface UsPolicyRatePoint {
  effectiveDate: Date; // 目標利率變動的生效日（UTC 午夜）
  // 2008-12-16 起 Fed 改用「目標區間」，之前是單一目標值。為了讓下游一套欄位邏輯能跨這條分界，
  // 單一目標值的那段把上下限存成同一個數字。百分比數字（4.00 代表 4.00%）。
  targetUpper: number;
  targetLower: number;
}
