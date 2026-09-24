/**
 * 把一次 createMany 拆成小批送出。不是為了效能，是為了記憶體。
 *
 * ## 結論
 *
 * Prisma 的保留量會隨 createMany 呼叫累積上升，**但會收斂到一個平台**，而那個平台跟**單次批量大小**
 * 成正比。所以分批是真的解法（壓低平台），不只是拖慢成長。
 *
 * ## 實測（2026-09-24，gov-ts 堆疊：Prisma 7 + @prisma/adapter-pg + Neon）
 *
 * monthly-unemployment-rate 的 12,055 列，fetch/parse 只做一次、迴圈裡只重複 createMany，
 * 每輪強制 GC 後才記錄 heapUsed，每個批量各自開乾淨的 process：
 *
 * ```
 * batch 500（每輪 25 次呼叫）
 *   round 1   76.1   Δ +56.4
 *   round 2   85.8   Δ  +9.7
 *   round 3   95.5   Δ  +9.7
 *   round 4  105.3   Δ  +9.7
 *   round 5  105.7   Δ  +0.4   ← 平台
 *   round 6-8 105.8  Δ  +0.0
 * ```
 *
 * **平台由累積呼叫次數決定，不是輪數。** oingg-sitca-ts 同日用 69,139 列量同一件事，每輪 138 次
 * 呼叫，在 round 1 就到平台（123.6MB）並維持六輪不動。我每輪只有 25 次呼叫，所以要五輪
 * （125 次 ≈ 他們一輪的 138 次）才飽和。兩邊的數字用同一個機制就解釋得通。
 *
 * 這也是為什麼 batch 5000 看起來「線性不收斂」：每輪只有 3 次呼叫，三輪才 9 次，離飽和還很遠。
 * **不要用少數幾輪去判斷收不收斂，要看累積呼叫次數。**
 *
 * 保留跟「實際寫入幾列」無關——用 skipDuplicates 且資料全部已存在、實際插入 0 列，照樣長；
 * 拿掉資料庫呼叫只跑 fetch + parse 則完全平坦（12.9 / 12.9 / 13.0 MB）。所以保留在建構／傳送
 * 那個參數化查詢的路徑上。
 *
 * **機制完全未知。** 曾經懷疑是 node-postgres pool 裡每條連線各自保留一塊讀取 buffer，但那個
 * 假說是**未測**——sitca-ts 2026-09-24 試過用 `pool.max` 10 vs 2 做判別，同批量下 RSS 只差 13MB，
 * 但那個實驗對假說沒有判別力：`pool.max` 是上限不是預先配置，而連線又是走 Neon 的 pooled endpoint
 * （pgbouncer transaction mode，N 條 client 連線可以多工到少數後端連線），所以無從得知兩組實際
 * 各開了幾條 client 連線。**這個限制對 gov-ts 一樣適用**，我們的 DATABASE_URL 也是 -pooler。
 * 要判別得在 client 端直接讀 `pool.totalCount`，並用併發寫入逼出多條連線——兩者都還沒有人做。
 *
 * 飽和為什麼由累積呼叫次數決定，同樣沒有解釋。
 *
 * 規律本身可用、處置不受影響：降批量降低平台這件事是實測的，不依賴機制解釋。
 *
 * 速度代價實測為零：往返次數變多（12,055/500 = 25 次 vs 3 次），但 Neon 的往返延遲遠小於序列化
 * 一大包的成本。
 *
 * ## 量測方法的兩個坑（都踩過）
 *
 * 1. **不同批量要各自開乾淨的 process。** 先跑的大批量會把高水位墊起來，後跑的小批量看起來就平。
 * 2. **輪數要夠。** 三輪不足以判斷收斂，見上面 batch 5000 的例子。
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
