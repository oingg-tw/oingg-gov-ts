import type { FundDailyNavPoint } from '@/domains/fundDailyNav/types';

// 已用真實檔案核對過（2026-09-11）：UTF-8 with BOM、12 欄、無雙引號跳脫需求。
const HEADER = '日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號';

const toNullableNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const value = Number(trimmed);
  return Number.isNaN(value) ? null : value;
};

export const parseFundDailyNav = (csv: string): FundDailyNavPoint[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines[0] !== HEADER) {
    throw new Error('SITCA 每日淨值資料的表頭欄位跟預期不符，格式可能已變更。');
  }

  const points: FundDailyNavPoint[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(',');
    if (fields.length !== 12) continue; // 格式不符的列，跳過而不是猜

    const dateRaw = fields[0] ?? '';
    const match = dateRaw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) continue;

    const beneficiaryCode = (fields[11] ?? '').trim();
    if (beneficiaryCode === '') continue; // 沒有可靠唯一鍵的列跳過，不勉強拼一個假的鍵

    points.push({
      tradeDate: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
      memberCode: fields[1] ?? '',
      companyName: fields[2] ?? '',
      fundTaxId: fields[3] ?? '',
      fundCode: fields[4] ?? '',
      fundName: fields[5] ?? '',
      navValue: toNullableNumber(fields[6] ?? ''),
      changeValue: toNullableNumber(fields[7] ?? ''),
      changePercent: toNullableNumber(fields[8] ?? ''),
      typeCode: fields[9] ?? '',
      currency: fields[10] ?? '',
      beneficiaryCode,
    });
  }

  return points;
};
