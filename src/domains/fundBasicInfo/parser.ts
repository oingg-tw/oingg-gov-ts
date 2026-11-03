import type { FundBasicInfoPoint } from '@/domains/fundBasicInfo/types';
import { parseSourceNumber, parseYmdDate } from '@/shared/parseSourceValue';

// 已用真實檔案核對過（2026-09-11）：UTF-8 with BOM、16 欄、無雙引號跳脫需求。
const HEADER =
  '年月,公司名稱,基金名稱,統編,基金/級別成立日期,基金規模日期,基金規模幣別,基金級別規模_金額,基金規模(依基金別)_金額,基金類型別,投資地區,基金配息規定(基金收益分配規定),基金ISIN Code,保管銀行(國內),保管銀行(國外),基金計價幣別';

const toNullableString = (raw: string): string | null => {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
};

// 「基金規模幣別」來源寫中文，另一欄「基金計價幣別」跟每日淨值的幣別卻是 ISO 代碼；統一存 ISO。
// 沒見過的寫法丟錯，補進對照表，不要猜。
const CURRENCY_CODES: Record<string, string> = { 台幣: 'TWD' };

// 「基金類型別」是代號跟名稱擠在同一格："(AH22) 跨國投資指數股票型_債券型"，拆成兩欄。
const FUND_TYPE = /^\(([A-Z0-9]+)\)\s*(.+)$/;

export const parseFundBasicInfo = (csv: string): FundBasicInfoPoint[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines[0] !== HEADER) {
    throw new Error('SITCA 境內基金基本資料的表頭欄位跟預期不符，格式可能已變更。');
  }

  const points: FundBasicInfoPoint[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(',');
    if (fields.length !== 16) throw new Error(`SITCA 境內基金基本資料有一列是 ${fields.length} 欄（預期 16），來源格式可能已變更：「${line.slice(0, 80)}」`);

    const yearMonth = fields[0] ?? '';
    const match = yearMonth.match(/^(\d{4})(\d{2})$/);
    if (!match) throw new Error(`SITCA 境內基金基本資料：無法解析的年月「${yearMonth}」（預期西元 YYYYMM），來源格式可能已變更。`);

    // 實測發現有極少數列（4433 筆裡 1 筆）ISIN Code 是空的——這種列沒有可靠的唯一鍵可用，
    // 跳過不收，不勉強拼一個假的鍵。
    const isinCode = (fields[12] ?? '').trim();
    if (isinCode === '') continue;

    const at = `SITCA 境內基金基本資料 ${isinCode}`;
    const rawCurrency = (fields[6] ?? '').trim();
    const fundSizeCurrency = CURRENCY_CODES[rawCurrency];
    if (!fundSizeCurrency) throw new Error(`${at} 基金規模幣別「${rawCurrency}」不在對照表裡，請補上 ISO 代碼。`);
    const fundType = (fields[9] ?? '').trim().match(FUND_TYPE);
    if (!fundType) throw new Error(`${at} 基金類型別「${fields[9]}」不是「(代號) 名稱」格式，來源格式可能已變更。`);

    points.push({
      year: Number(match[1]),
      month: Number(match[2]),
      companyName: fields[1] ?? '',
      fundName: fields[2] ?? '',
      fundTaxId: fields[3] ?? '',
      fundInceptionDate: parseYmdDate(fields[4], `${at} 基金/級別成立日期`),
      fundSizeDate: parseYmdDate(fields[5], `${at} 基金規模日期`),
      fundSizeCurrency,
      classSizeAmount: parseSourceNumber(fields[7], ['', '-'], `${at} 基金級別規模_金額`),
      fundSizeAmount: parseSourceNumber(fields[8], ['', '-'], `${at} 基金規模_金額`),
      fundTypeCode: fundType[1]!,
      fundTypeName: fundType[2]!.trim(),
      investmentRegion: fields[10] ?? '',
      dividendPolicy: toNullableString(fields[11] ?? ''),
      isinCode,
      custodianDomestic: toNullableString(fields[13] ?? ''),
      custodianForeign: toNullableString(fields[14] ?? ''),
      denominationCurrency: fields[15] ?? '',
    });
  }

  return points;
};
