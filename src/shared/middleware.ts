import { Request, Response, NextFunction } from 'ultimate-express';
import { timingSafeEqual } from 'crypto';
import { readCleanEnv } from '@/shared/config';

/**
 * timingSafeEqual 要求兩個 buffer 等長，否則直接 throw；長度不同本身就代表密鑰不對，
 * 所以長度不符直接判定失敗，不用真的呼叫 timingSafeEqual。
 */
function safeSecretEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Middleware to require a task secret for specific endpoints.
 * It checks for a secret in the 'x-task-secret' header only.
 *
 * 2026-10-22 起不再收 ?task_secret= 網址參數：Cloud Run 的 request log 會記完整網址，用網址帶密鑰
 * 不管程式怎麼寫都會外流（mops/twse review 指出）。近 30 天 PRD request log 查過 0 筆這樣用。
 * The expected secret should be set in the environment variable `TASK_SECRET`.
 *
 * If the secret is missing or invalid, it sends a 401 Unauthorized response.
 * If the `TASK_SECRET` environment variable is not set, it sends a 500 Server Error.
 *
 * （fail-closed 500 + timingSafeEqual 跟 oingg-twse-ts 的 requireTaskSecret 同一套，見 oingg-conductor-ts
 * 的 docs/conventions.md「TASK_SECRET」一節；2026-10-29 起值髒就 500，不再像 twse 那樣去引號，見 readCleanEnv。）
 */
export const requireTaskSecret = (req: Request, res: Response, next: NextFunction) => {
  let expectedSecret: string | undefined;
  try {
    expectedSecret = readCleanEnv('TASK_SECRET'); // 每次請求即時讀取，不快取
  } catch (err) {
    console.error((err as Error).message); // errorHandler 不寫 log，這裡不記的話 Cloud Logging 只看得到 500
    return res.status(500).json({ message: 'Server configuration error: Task secret is malformed.' });
  }

  if (!expectedSecret) {
    console.error('TASK_SECRET environment variable is not set. Please configure it.');
    return res.status(500).json({ message: 'Server configuration error: Task secret not defined.' });
  }

  const providedSecretRaw = req.headers['x-task-secret'];
  const providedSecret = Array.isArray(providedSecretRaw) ? providedSecretRaw[0] : providedSecretRaw;

  // 用 timingSafeEqual 而不是 !==，避免時序攻擊可以從回應時間差猜出密鑰。
  if (typeof providedSecret !== 'string' || !safeSecretEquals(providedSecret, expectedSecret)) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or missing task secret.' });
  }

  next(); // 密鑰有效，繼續處理請求
};
