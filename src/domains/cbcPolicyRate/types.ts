export interface CbcPolicyRatePoint {
  effectiveDate: Date; // 利率調整生效日（UTC 午夜，對應 CBC 回應的 YYYYMMDD）
  discountRate: number; // 重貼現率（百分比，2.000 代表 2.000%）
  collateralAccommodationRate: number; // 擔保放款融通利率
  unsecuredAccommodationRate: number; // 短期融通利率（無擔保）
}
