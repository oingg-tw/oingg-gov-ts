import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 明確排除 dist——`pnpm run build` 會把 src/tests/*.test.ts 一併編譯成 dist/tests/*.test.js，
    // 實測發現不排除的話 vitest 會把兩邊都當成測試檔跑，同一批測試跑兩次（本機 build 過一次後
    // 才會發生，CI 從乾淨的 checkout 跑不會踩到，但本機開發很容易忘記，明確排除比較保險）。
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  resolve: {
    // 跟 tsconfig.json 的 paths（"@/*": ["src/*"]）對應——tsx 會自動讀 tsconfig 解析 @/，
    // 但 vitest 底層是 Vite，不會自動讀，要在這裡手動對應一次。
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
