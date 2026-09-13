import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import prisma from '@/adapters/prisma/index';
import { FIA_BUSINESS_TAX_REGISTRY_CSV_URL, parseFiaBusinessTaxRegistryLine } from '@/adapters/fia/client';
import type { IngestCompanyIndustryClassificationResult } from '@/domains/companyIndustryClassification/types';
import { OUTBOUND_USER_AGENT } from '@/shared/config';

const EXPORT_DATASET = 'company_industry_classification'; // 對應 export.company_industry_classification view

// 跟 govBondYield10y 同樣的道理：analysis-ts 只認 export.ingestion_runs 裡 status='success' 的紀錄，
// 這是輔助性記帳動作，失敗不能讓主要 ingest 結果跟著失敗。rowCount 記的是實際寫入的分類列數
// （totalClassificationRows，一家公司可能貢獻到 4 列），不是追蹤的公司數。
const recordIngestionRun = async (status: 'success' | 'failed', rowCount: number): Promise<void> => {
  try {
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: new Date(), rowCount, status },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 財政部原始代碼是 6 碼數字（例如 "233100"），tax_industry_classification 的 subclass 代碼格式是
// 前4碼-後2碼（例如 "2331-00"）——已用亞洲水泥(統編03244509)實測驗證過這個轉換規則跟真實資料對得起來
// （"233100" 對到 "2331-00" 水泥製造，符合實際主業）。
export const toSubclassCode = (raw: string): string | null => {
  if (!/^\d{6}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
};

interface RegistryClassificationEntry {
  rank: number; // 0=主要(行業代號)，1/2/3=次要(行業代號1/2/3)，對應原始欄位順序
  industryCode: string; // 已轉換成 subclass 格式；只有 toSubclassCode 轉換成功的項目才會進到這裡
  sourceIndustryName: string;
}

interface RegistryMatch {
  taxId: string;
  registeredAddress: string;
  entries: RegistryClassificationEntry[]; // 可能是空陣列——代表有找到總公司登記列，但列裡所有行業代號格式都不合法（跟 tax_industry_classification 對不對得上是下一步的事，這裡先不管）
}

// 全國稅籍登記檔（約322MB、171萬列）用串流逐行處理，不整份載進記憶體——只在乎 targetTaxIds 這個小
// 集合，其餘列邊讀邊丟。回傳每個統編找到的「總公司本身」那一列（統一編號=自己、總機構統一編號=空白）。
const streamMatchRegistry = async (targetTaxIds: Set<string>): Promise<Map<string, RegistryMatch>> => {
  const response = await fetch(FIA_BUSINESS_TAX_REGISTRY_CSV_URL, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok || !response.body) {
    throw new Error(`FIA 稅籍登記資料下載失敗：HTTP ${response.status}`);
  }

  const matches = new Map<string, RegistryMatch>();
  const rl = createInterface({ input: Readable.fromWeb(response.body as any), crlfDelay: Infinity });

  let isFirstLine = true;
  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false; // 跳過表頭
      continue;
    }
    if (matches.size >= targetTaxIds.size) break; // 已經找齊全部目標，不用把整份檔案讀完

    const row = parseFiaBusinessTaxRegistryLine(line);
    if (!row) continue;
    if (row.headOfficeTaxId !== '') continue; // 只要總公司本身的登記列，不要分公司/廠
    if (!targetTaxIds.has(row.taxId)) continue;
    if (matches.has(row.taxId)) continue; // 理論上總公司列唯一，保險起見只取第一筆

    // row.industryCodes 依原始欄位順序排列（[0]=主要，[1..3]=次要，只含代碼非空的項目，見
    // adapters/fia/client.ts）；這裡的索引剛好就是 rank。轉換失敗的項目直接跳過，不補位、不影響
    // 其他項目的 rank——即使 entries 最後是空陣列，仍然要 set 進 matches（下面一行），代表「有找到
    // 登記列，但代碼格式不合法」，不能跟「根本沒找到登記列」混在一起算，否則 notFoundInRegistry
    // 會把這種情況也算進去（早期版本就有這個問題，這裡順便修掉）。
    const entries: RegistryClassificationEntry[] = [];
    row.industryCodes.forEach((ic, rank) => {
      const industryCode = toSubclassCode(ic.code);
      if (!industryCode) return;
      entries.push({ rank, industryCode, sourceIndustryName: ic.name });
    });

    matches.set(row.taxId, { taxId: row.taxId, registeredAddress: row.address, entries });
  }

  return matches;
};

export const ingestCompanyIndustryClassification = async (): Promise<IngestCompanyIndustryClassificationResult> => {
  const targetProfiles = await prisma.companyProfile.findMany({ select: { taxId: true } });
  const targetTaxIds = new Set(targetProfiles.map((p) => p.taxId));

  if (targetTaxIds.size === 0) {
    return { success: true, targetCount: 0, matched: 0, notFoundInRegistry: 0, invalidIndustryCode: 0, totalClassificationRows: 0 };
  }

  let registryMatches: Map<string, RegistryMatch>;
  try {
    registryMatches = await streamMatchRegistry(targetTaxIds);
  } catch (error) {
    await recordIngestionRun('failed', 0);
    return {
      success: false,
      targetCount: targetTaxIds.size,
      matched: 0,
      notFoundInRegistry: 0,
      invalidIndustryCode: 0,
      totalClassificationRows: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // 只驗證真的用到的代碼，不用把全部 2,466 筆分類代碼都撈出來——一家公司最多貢獻 4 個代碼，用
  // flatMap 攤平成單一集合再去重。
  const usedCodes = [...new Set([...registryMatches.values()].flatMap((m) => m.entries.map((e) => e.industryCode)))];
  const validClassifications = await prisma.taxIndustryClassification.findMany({
    where: { code: { in: usedCodes } },
    select: { code: true },
  });
  const validCodes = new Set(validClassifications.map((c) => c.code));

  let matched = 0;
  let invalidIndustryCode = 0;
  let totalClassificationRows = 0;

  for (const match of registryMatches.values()) {
    const validEntries = match.entries.filter((e) => validCodes.has(e.industryCode));
    if (validEntries.length === 0) {
      invalidIndustryCode++;
      continue;
    }

    // 跟 companyProfile 的 businessItems 一樣的道理：來源是「這家公司當下完整的行業代號清單」，整批
    // 刪除重建比逐筆比對更新簡單，也更不會留下髒資料（例如上次有次要代號、這次稅籍登記拿掉了）。
    await prisma.$transaction(async (tx) => {
      await tx.companyIndustryClassification.deleteMany({ where: { taxId: match.taxId } });
      await tx.companyIndustryClassification.createMany({
        data: validEntries.map((entry) => ({
          taxId: match.taxId,
          rank: entry.rank,
          industryCode: entry.industryCode,
          sourceIndustryName: entry.sourceIndustryName,
          registeredAddress: match.registeredAddress,
        })),
      });
    });

    matched++;
    totalClassificationRows += validEntries.length;
  }

  const notFoundInRegistry = targetTaxIds.size - registryMatches.size;

  await recordIngestionRun('success', totalClassificationRows);
  return { success: true, targetCount: targetTaxIds.size, matched, notFoundInRegistry, invalidIndustryCode, totalClassificationRows };
};
