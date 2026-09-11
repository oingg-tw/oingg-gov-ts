export interface FundBasicInfoPoint {
  year: number;
  month: number;
  companyName: string; // 基金公司(投信)名稱
  fundName: string;
  fundTaxId: string; // 統編
  fundInceptionDate: string; // 基金/級別成立日期，原始格式（可能是西元或民國，來源未標明，故意不轉型，見 parser.ts 說明）
  fundSizeDate: string; // 基金規模日期，同樣原樣保留
  fundSizeCurrency: string;
  classSizeAmount: number | null; // 基金級別規模_金額
  fundSizeAmount: number | null; // 基金規模(依基金別)_金額
  fundType: string; // 基金類型別，例如 "(AH22) 跨國投資指數股票型_債券型"
  investmentRegion: string;
  dividendPolicy: string;
  isinCode: string; // 基金ISIN Code，跟 (year, month) 一起是唯一鍵
  custodianDomestic: string | null;
  custodianForeign: string | null;
  denominationCurrency: string;
}
