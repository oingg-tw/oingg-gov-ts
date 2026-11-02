// 來源欄位轉型別。只有該來源明文的缺值標記（CBC 的 "-"、ECB 的空字串……）回 null，其他解析不了的
// 一律丟錯——2026-11-03 之前各 parser 是 Number.isNaN → null 或整列跳過，來源一旦改成千分位、全形或
// 百分號，整欄會安靜地變成 null，ingest 還回 200。丟錯會讓 ingest 失敗、5xx 告警響。
const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export const parseSourceNumber = (raw: unknown, missing: readonly string[], field: string): number | null => {
  if (typeof raw !== 'string') throw new Error(`${field}：預期是字串，收到 ${raw === undefined ? 'undefined' : typeof raw}。`);
  const v = raw.trim();
  if (missing.includes(v)) return null;
  if (!PLAIN_NUMBER.test(v)) throw new Error(`${field}：無法解析的數字「${raw}」，來源格式可能已變更。`);
  return Number(v);
};

// 西元 8 碼日期 "YYYYMMDD" → UTC 午夜的 Date。空字串是「沒有這個日期」回 null，其他格式或不存在的日期丟錯。
export const parseYmdDate = (raw: string | undefined, field: string): Date | null => {
  const v = (raw ?? '').trim();
  if (v === '') return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) return date;
  }
  throw new Error(`${field}：無法解析的日期「${raw}」（預期西元 YYYYMMDD），來源格式可能已變更。`);
};
