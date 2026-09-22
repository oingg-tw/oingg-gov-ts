export interface LaborBrokerLicensePoint {
  licenseNo: string; // 正規化後的許可證號（去前導零），跟評鑑資料的 join key
  rawLicenseNo: string; // 原始許可證欄位（補零格式，例如 "0002" 或換證的 "0002-1"）
  agencyName: string;
  address: string;
  phone: string;
  responsiblePerson: string;
  taxId: string | null; // 公司統一編號，8 碼；約 2% 的列是空的或格式不合，存 null
  professionalStaffCount: number | null;
  staffCount: number | null;
  licenseStartDate: Date | null;
  licenseEndDate: Date | null;
  suspensionStartDate: Date | null;
  suspensionEndDate: Date | null;
  expectedResumeDate: Date | null;
  terminatedDate: Date | null; // 終止營業日期
  revokedDate: Date | null; // 廢止許可日期
}
