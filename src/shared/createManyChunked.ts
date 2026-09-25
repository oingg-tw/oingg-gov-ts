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
 * ## 機制：定位到 Prisma 建構參數那一段
 *
 * sitca-ts 2026-09-25 跑了 tpex-ts 提的對照實驗：同一份 69,139 列、同樣分批 500、同樣實際寫入
 * 0 列、乾淨 process 三輪，只把寫入方式換掉：
 *
 * ```
 *                    createMany      $executeRaw 多列 INSERT
 * 平台 heap（GC 後）     123.6              70.6
 * 平台 RSS               579.1             317.3
 * ```
 *
 * **兩者都收斂，但 createMany 的平台高 3.2 倍。** 所以 retainer 在「Prisma 把整批 args 建成 query
 * engine 參數結構」那一段，不在 pool、也不在 driver。tpex-ts 同一個 stack、11,289 列走 `$executeRaw`
 * 實測零棘輪，獨立佐證同一個方向。
 *
 * 曾經懷疑過的 per-connection 讀取 buffer 假說到最後是**未測**（不是否證）：用 `pool.max` 10 vs 2
 * 做的實驗沒有判別力——`pool.max` 是上限不是預先配置，而連線走 Neon 的 pooled endpoint
 * （pgbouncer transaction mode 會把 N 條 client 連線多工到少數後端連線），所以無從得知兩組實際各開
 * 幾條。**這個限制對 gov-ts 一樣適用**，我們的 DATABASE_URL 也是 -pooler。不過既然保留已經定位到
 * Prisma 那一層，這個假說也不再重要。
 *
 * 飽和為什麼由累積呼叫次數決定，仍然沒有解釋。
 *
 * ## 如果哪天分批 + 記憶體上限還不夠
 *
 * 換成 `$executeRaw` 手拼多列 INSERT 還有約 3 倍空間。**刻意不做**：11 個 domain 共用這支 helper，
 * 手拼 SQL 沒有型別檢查，欄位順序錯了要執行期才知道，而目前根本沒有痛點（prod 峰值見 README
 * 「Production memory headroom」一節）。這是萬一的第二手，不是預設選項。
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
