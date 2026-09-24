/**
 * 把一次 createMany 拆成小批送出。不是為了效能，是為了記憶體。
 *
 * ## 實測（2026-09-24，gov-ts 自己的堆疊：Prisma 7 + @prisma/adapter-pg + Neon）
 *
 * 用 monthly-unemployment-rate 的 12,055 列，每個批量各跑三輪、**每輪強制 GC 後**才記錄 heapUsed，
 * 而且每個批量用獨立的乾淨 process（這點很重要，見下）：
 *
 * ```
 * batch 12055（整包一次）  78.7 → 129.0 → 179.2 → 228.0 → 273.8 → 324.0   （六輪，+50/輪）
 * batch  5000              77.6 → 125.8 → 174.3                          （+48/輪）
 * batch   500              76.0 →  85.7 →  95.4                          （+9.7/輪）
 * ```
 *
 * 結論：**保留量是線性累積的，在測過的每個批量都不收斂；但斜率跟單次批量大小成正比。**
 * 降到 500 讓斜率小約 5 倍，這是目前唯一便宜有效的緩解手段，但**不是根治**。
 *
 * 洩漏跟「實際寫入幾列」無關——用 skipDuplicates 且資料全部已存在、實際插入 0 列，照樣漏；
 * 拿掉資料庫呼叫只跑 fetch + parse 則完全平坦（12.9 / 12.9 / 13.0 MB）。所以保留發生在建構／傳送
 * 那個參數化查詢的路徑上。sitca-ts 同日獨立量到同一個方向，懷疑是 node-postgres 的
 * Connection/Parser 讀取 buffer 跨查詢重用；真正的 retainer 還沒有人定位出來。
 *
 * ## 量測方法的坑（我自己踩過）
 *
 * 第一次量的時候，batch 500 看起來完全平（128.8 → 138.5 → 124.3），我因此以為分批可以根治。
 * 那是假的：那三輪跑在一個已經被前面 batch 12055 的測試墊高到 RSS 644MB 的 process 裡。
 * **不同批量一定要各自開乾淨的 process 量**，否則先跑的那個會把高水位墊起來，後跑的看起來就平。
 *
 * 速度代價實測為零：往返次數變多（12,055/500 = 25 次 vs 3 次），但 Neon 的往返延遲遠小於序列化
 * 一大包的成本。
 *
 * 用 callback 形式而不是直接吃 Prisma 的 model delegate——delegate 的 createMany 參數型別是逐 model
 * 產生的，用結構型別去套會撞變異數問題，callback 讓呼叫端保留完整型別檢查。
 */
const DEFAULT_CHUNK_SIZE = 500;

export const createManyChunked = async <T>(
  create: (rows: T[]) => Promise<{ count: number }>,
  data: T[],
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<number> => {
  let count = 0;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const result = await create(data.slice(offset, offset + chunkSize));
    count += result.count;
  }
  return count;
};
