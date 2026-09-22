export interface LaborBrokerEvaluationPoint {
  year: number; // 西元年（原始檔是民國年，parser 已轉換）
  licenseNo: string; // 正規化後的許可證號，對應 labor_broker_license.license_no
  companyName: string;
  region: string; // 例如「桃園市桃園區」
  address: string;
  qualityScore: number | null; // 品質管理
  violationScore: number | null; // 違規處分（可能是負數）
  customerServiceScore: number | null; // 顧客服務
  otherScore: number | null; // 其他事項
  totalScore: number | null; // 總成績
  hasSuspension: boolean; // 停業處分及申報暫停營業（原始 Y/N）
  hasMajorViolation: boolean; // 重大違法行為（原始 Y/N）
}
