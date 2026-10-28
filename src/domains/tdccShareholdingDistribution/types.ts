export interface TdccShareholdingDistributionPoint {
  symbol: string; // 證券代號（來源補空白到 6 碼，已 trim）
  dataDate: Date; // 資料日期（YYYYMMDD 轉成的 UTC 日期）
  holdingLevel: number; // 1～15 級距、16 差異數調整、17 合計
  holderCount: bigint;
  shares: bigint;
  custodyPct: string; // 原字串直接寫進 DECIMAL(6,2)，不經過浮點數
}
