// 用只限 oingg-gov 專案的 Neon 金鑰跑 neon CLI（使用者 2026-11-17 定的，見 CLAUDE.md 的「Neon 金鑰」）。
// 金鑰從 %USERPROFILE%\.neon-keys\oingg-gov.key 讀，只經 NEON_API_KEY 環境變數交給 neon：不印、不放進指令參數、不寫進設定。
// 用法：node scripts/neon-local.mjs <neon 的參數>，例如 node scripts/neon-local.mjs branches list --project-id late-glade-32772387
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const key = readFileSync(join(homedir(), '.neon-keys', 'oingg-gov.key'), 'utf8').trim();
// Windows 上 neon 是 .cmd，要經 shell 才找得到；JSON 之類的內容用 -d @檔案 傳，不要放在參數裡
const result = spawnSync('neon', process.argv.slice(2), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NEON_API_KEY: key },
});
process.exit(result.status ?? 1);
