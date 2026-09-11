export interface FundDailyNavPoint {
  tradeDate: Date; // 日期（YYYYMMDD 轉成的 UTC 日期，時間部分固定 00:00:00）
  memberCode: string; // 會員代號
  companyName: string;
  fundTaxId: string; // 基金統編
  fundCode: string; // 基金代號——實測發現這個不是逐檔唯一鍵，同一天同一個代號會對應好幾檔完全不同公司的基金，只能當描述性欄位
  fundName: string;
  navValue: number | null; // 基金淨值，可能是 "-"（缺值）
  changeValue: number | null; // 漲跌
  changePercent: number | null; // 漲跌幅
  typeCode: string; // 類型代號
  currency: string;
  beneficiaryCode: string; // 受益憑證代號，跟 tradeDate 一起是唯一鍵（已用真實資料驗證：4451 列全部唯一、無缺值）
}
