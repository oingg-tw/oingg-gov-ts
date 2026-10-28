import type { TdccShareholdingDistributionPoint } from '@/domains/tdccShareholdingDistribution/types';

// 已用真實檔案核對過（2026-10-28，資料日 20261022）：6 欄、4,100 檔 × 17 級 = 69,700 列、無引號跳脫；
// 證券代號補空白到 6 碼（例如 "0050  "）。
const HEADER = '資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%';

export const parseTdccShareholdingDistribution = (csv: string): TdccShareholdingDistributionPoint[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines[0] !== HEADER) {
    throw new Error('集保股權分散表的表頭欄位跟預期不符，格式可能已變更。');
  }

  const points: TdccShareholdingDistributionPoint[] = [];
  for (const line of lines.slice(1)) {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.length !== 6) continue; // 格式不符的列，跳過而不是猜

    const [dateRaw = '', symbol = '', levelRaw = '', holderCountRaw = '', sharesRaw = '', custodyPct = ''] = fields;
    const match = dateRaw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match || symbol === '' || !/^\d+$/.test(levelRaw) || !/^\d+$/.test(holderCountRaw) || !/^\d+$/.test(sharesRaw)) continue;
    if (!/^\d+(\.\d+)?$/.test(custodyPct)) continue;

    points.push({
      symbol,
      dataDate: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
      holdingLevel: Number(levelRaw),
      holderCount: BigInt(holderCountRaw),
      shares: BigInt(sharesRaw),
      custodyPct,
    });
  }

  return points;
};
