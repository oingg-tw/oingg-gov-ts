// monthly_cpi（v_monthly_cpis）只放總指數跟七大類，數據中台拿來當總經篩選因子。檔案裡全部 81 項（含「米類及其
// 製品」這種細項）2026-11-23 起另存 monthly_cpi_item（v_monthly_cpi_items）：網頁前端要讓 CPI 頁從大類往下展開，
// 使用者說總經相關的都要用。
export type CpiCategory =
  | 'total' // 總指數
  | 'food' // 一.食物類
  | 'clothing' // 二.衣著類
  | 'housing' // 三.居住類
  | 'transport_communication' // 四.交通及通訊類
  | 'medical' // 五.醫藥保健類
  | 'education_recreation' // 六.教養娛樂類
  | 'misc'; // 七.雜項類

export interface MonthlyCpiPoint {
  year: number; // 西元年
  month: number; // 1-12
  category: CpiCategory;
  indexValue: number | null; // 原始值（指數，基期見官方檔案標註，目前是民國110年=100；官方之後改基期年時這裡的數字含義會跟著變，不在這裡處理換基期）
  yoyChangePercent: number | null; // 年增率(%)；資料起始年份附近常缺值（沒有前一年可比較），null 是真的缺值，不是 0
}

// 81 項的一列（一個月一項）。階層照官方編號：總指數 → 「一.」大類 → 「1.」 → 「(1)」。
export interface MonthlyCpiItemPoint {
  year: number; // 西元年
  month: number; // 1-12
  itemName: string; // 官方名稱去掉編號和基期標註，例如「米類及其製品」；81 項不重複（解析時檢查）
  itemCode: string; // gov 定的英文代碼（parser.ts 的 CPI_SUB_ITEM_CODES），主計總處改名、改編號時不變；總指數和七大類同 category
  category: CpiCategory; // 所屬大類，總指數自己是 total
  parentItemName: string | null; // 上一層的 itemName；總指數是 null，大類是「總指數」
  itemOrder: number; // 官方檔案裡的順序，從 1 起
  indexValue: number | null; // 同 MonthlyCpiPoint
  yoyChangePercent: number | null;
}
