export interface DailyUsdTwdRatePoint {
  tradeDate: Date; // UTC 午夜，對應 CBC 回應的 YYYYMMDD
  bankBuyingRate: number | null; // 銀行對客戶買匯（每 1 美元兌新台幣元）
  bankSellingRate: number | null; // 銀行對客戶賣匯
  interbankClosingRate: number | null; // 台北外匯市場收盤價，一般報導引用的數字
}
