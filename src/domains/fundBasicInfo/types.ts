export interface FundBasicInfoPoint {
  year: number;
  month: number;
  companyName: string; // 基金公司(投信)名稱
  fundName: string;
  fundTaxId: string; // 統編
  fundInceptionDate: Date | null; // 基金/級別成立日期（來源西元 YYYYMMDD）
  fundSizeDate: Date | null; // 基金規模日期（來源西元 YYYYMMDD）
  fundSizeCurrency: string; // ISO 4217，來源寫中文（「台幣」），parser 對照轉換
  classSizeAmount: number | null; // 基金級別規模_金額
  fundSizeAmount: number | null; // 基金規模(依基金別)_金額
  fundTypeCode: string; // 基金類型代號，例如 "AH22"（同 fund_daily_nav.type_code）
  fundTypeName: string; // 基金類型名稱，例如 "跨國投資指數股票型_債券型"
  investmentRegion: string;
  dividendPolicy: string | null; // 來源空白存 null
  isinCode: string; // 基金ISIN Code，跟 (year, month) 一起是唯一鍵
  custodianDomestic: string | null;
  custodianForeign: string | null;
  denominationCurrency: string;
}
