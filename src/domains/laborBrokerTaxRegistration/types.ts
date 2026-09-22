// 稅務行業標準分類裡跟人力仲介/供應有關的 subclass 代碼。7810-11「移工仲介」是這個 domain 的核心
// ——它是全台灣唯一能用公開資料指認「這家公司實際在做跨國人力仲介」的欄位，公司名稱完全看不出來
// （2026-09-22 實測：登記為移工仲介的業者裡，名稱不含「人力/仲介/就業」的佔多數，例如漁業合作社、
// 娛樂事業公司）。另外兩碼一起收，因為部分業者登記在較寬的類別下。
export const LABOR_BROKER_INDUSTRY_CODES: Readonly<Record<string, string>> = {
  '7810-11': '移工仲介',
  '7810-99': '其他人力仲介',
  '7820-00': '人力供應',
};

export interface LaborBrokerTaxRegistrationPoint {
  taxId: string; // 統一編號
  industryCode: string; // subclass 格式，見 LABOR_BROKER_INDUSTRY_CODES
  businessName: string;
  address: string;
  isPrimaryIndustry: boolean; // true = 這是它的主要行業（稅籍的「行業代號」欄），false = 次要（行業代號1/2/3）
}
