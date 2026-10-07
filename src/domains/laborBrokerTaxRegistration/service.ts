import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import prisma from '@/adapters/prisma/index';
import { FIA_BUSINESS_TAX_REGISTRY_CSV_URL, parseFiaBusinessTaxRegistryLine } from '@/adapters/fia/client';
import { OUTBOUND_USER_AGENT } from '@/shared/config';
import { LABOR_BROKER_INDUSTRY_CODES, type LaborBrokerTaxRegistrationPoint } from '@/domains/laborBrokerTaxRegistration/types';

const EXPORT_DATASET = 'labor_broker_tax_registration';

// 財政部稅籍檔的行業代號是 6 碼數字（例如 "233100"），《稅務行業標準分類》的子類代碼格式是
// 前4碼-後2碼（例如 "2331-00"）——用亞洲水泥（統編 03244509）實測驗證過這個轉換規則跟真實資料
// 對得起來（"233100" 對到 "2331-00" 水泥製造，符合實際主業）。
//
// 2026-10-07 從已移除的 companyIndustryClassification 搬過來：那個 domain 整組刪掉之後，這裡是
// 唯一的使用者。注意 gov-ts 現在沒有 tax_industry_classification 那張代碼字典了，所以轉換出來的
// 代碼不會再被對照回中文行業名稱——這支只拿它跟 LABOR_BROKER_INDUSTRY_CODES 比對，不需要字典。
const toSubclassCode = (raw: string): string | null => {
  if (!/^\d{6}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
};

export interface IngestLaborBrokerTaxRegistrationResult {
  success: boolean;
  scannedRows: number;
  totalPoints: number;
  byIndustryCode: Record<string, number>;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', rowCount: number): Promise<void> => {
  try {
    // 稅籍檔沒有「資料期別」欄位，是每日重發的現況全檔——dataDate 記今天，代表「這份現況是什麼時候
    // 抓的」，跟其他有明確業務期別的 dataset 不同（那些記資料本身涵蓋到的最新期別）。
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate: new Date(), rowCount, status } });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 串流全國營業稅籍登記檔（約 322MB、171 萬列），只留行業代號落在 LABOR_BROKER_INDUSTRY_CODES 的
// 業者——逐行處理、不整份載進記憶體（322MB），
// 差別是那邊用「統編白名單」過濾，這邊用「行業代號」過濾。
//
// 只收總公司列（總機構統一編號為空）：分支機構在這份檔案裡是獨立列、但查核業者合不合法看的是法人
// 本身，分支跟著總公司的許可證走。2026-09-22 實測移工仲介有 1,028 家總公司 + 102 家分支。
export const ingestLaborBrokerTaxRegistration = async (): Promise<IngestLaborBrokerTaxRegistrationResult> => {
  const byIndustryCode: Record<string, number> = Object.fromEntries(Object.keys(LABOR_BROKER_INDUSTRY_CODES).map((c) => [c, 0]));
  let scannedRows = 0;
  const points: LaborBrokerTaxRegistrationPoint[] = [];
  const seen = new Set<string>();

  try {
    const response = await fetch(FIA_BUSINESS_TAX_REGISTRY_CSV_URL, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
    if (!response.ok || !response.body) {
      throw new Error(`財政部稅籍登記檔下載失敗：HTTP ${response.status}`);
    }
    const rl = createInterface({ input: Readable.fromWeb(response.body as never), crlfDelay: Infinity });

    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        continue;
      }
      scannedRows++;
      const row = parseFiaBusinessTaxRegistryLine(line);
      if (!row || row.headOfficeTaxId !== '') continue;

      row.industryCodes.forEach((ic, rank) => {
        const industryCode = toSubclassCode(ic.code);
        if (!industryCode || !(industryCode in LABOR_BROKER_INDUSTRY_CODES)) return;
        const key = `${row.taxId}-${industryCode}`;
        if (seen.has(key)) return;
        seen.add(key);
        byIndustryCode[industryCode]!++;
        points.push({
          taxId: row.taxId,
          industryCode,
          businessName: row.businessName,
          address: row.address,
          isPrimaryIndustry: rank === 0,
        });
      });
    }
  } catch (error) {
    await recordIngestionRun('failed', 0);
    return { success: false, scannedRows, totalPoints: 0, byIndustryCode, error: error instanceof Error ? error.message : String(error) };
  }

  // 整批刪除重建：業者會歇業、會變更登記行業別，舊列必須消失，不能只做新增（同 laborBrokerLicense）。
  // 分批寫入而不是整包 17,844 列一次送——這是 gov-ts 最大的單次 payload，而 Prisma 的保留量跟
  // 單次批量成正比（見 shared/createManyChunked.ts 的實測）。這裡不能直接用那個 helper：要跟
  // deleteMany 在同一個交易裡，所以改成 callback 形式自己迴圈。
  await prisma.$transaction(
    async (tx) => {
      await tx.laborBrokerTaxRegistration.deleteMany({});
      for (let offset = 0; offset < points.length; offset += 500) {
        await tx.laborBrokerTaxRegistration.createMany({ data: points.slice(offset, offset + 500) });
      }
    },
    { timeout: 30000 }
  );

  await recordIngestionRun('success', points.length);
  return { success: true, scannedRows, totalPoints: points.length, byIndustryCode };
};
