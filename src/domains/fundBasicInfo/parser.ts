import type { FundBasicInfoPoint } from '@/domains/fundBasicInfo/types';

// 已用真實檔案核對過（2026-09-11）：UTF-8 with BOM、16 欄、無雙引號跳脫需求。
const HEADER =
  '年月,公司名稱,基金名稱,統編,基金/級別成立日期,基金規模日期,基金規模幣別,基金級別規模_金額,基金規模(依基金別)_金額,基金類型別,投資地區,基金配息規定(基金收益分配規定),基金ISIN Code,保管銀行(國內),保管銀行(國外),基金計價幣別';

const toNullableNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const value = Number(trimmed);
  return Number.isNaN(value) ? null : value;
};

const toNullableString = (raw: string): string | null => {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

export const parseFundBasicInfo = (csv: string): FundBasicInfoPoint[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines[0] !== HEADER) {
    throw new Error('SITCA 境內基金基本資料的表頭欄位跟預期不符，格式可能已變更。');
  }

  const points: FundBasicInfoPoint[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(',');
    if (fields.length !== 16) continue; // 格式不符的列，跳過而不是猜

    const yearMonth = fields[0] ?? '';
    const match = yearMonth.match(/^(\d{4})(\d{2})$/);
    if (!match) continue;

    // 實測發現有極少數列（4433 筆裡 1 筆）ISIN Code 是空的——這種列沒有可靠的唯一鍵可用，
    // 跳過不收，不勉強拼一個假的鍵。
    const isinCode = (fields[12] ?? '').trim();
    if (isinCode === '') continue;

    points.push({
      year: Number(match[1]),
      month: Number(match[2]),
      companyName: fields[1] ?? '',
      fundName: fields[2] ?? '',
      fundTaxId: fields[3] ?? '',
      fundInceptionDate: fields[4] ?? '',
      fundSizeDate: fields[5] ?? '',
      fundSizeCurrency: fields[6] ?? '',
      classSizeAmount: toNullableNumber(fields[7] ?? ''),
      fundSizeAmount: toNullableNumber(fields[8] ?? ''),
      fundType: fields[9] ?? '',
      investmentRegion: fields[10] ?? '',
      dividendPolicy: fields[11] ?? '',
      isinCode,
      custodianDomestic: toNullableString(fields[13] ?? ''),
      custodianForeign: toNullableString(fields[14] ?? ''),
      denominationCurrency: fields[15] ?? '',
    });
  }

  return points;
};
