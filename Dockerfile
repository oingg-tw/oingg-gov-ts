# uWebSockets.js（ultimate-express 的依賴）是 native module，綁 Node ABI，build 和 runtime 版本
# 不能不一致，所以 builder 跟 runner 兩個 stage 都固定用同一個 Node base image。2026-10-13 從 22 升到 26
# （使用者決定，跟本機與 mops-ts 對齊）：uWebSockets.js 20.69.0 有 Node 26 的原生檔（ABI 147）。
FROM node:26-trixie-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@11

# postinstall（pnpm install 觸發）會跑 prisma generate，讀 prisma.config.ts 時會直接檢查 DIRECT_URL
# 這個環境變數存不存在（不需要真的連得上，只是讀設定檔這一步就會先擋）——容器裡沒有 .env，一定要
# 先給一個格式正確的假值，不然連 `pnpm install` 本身都會失敗（實測發現，見
# oingg-conductor-ts/docs/production-deployment.md「prisma generate 在 CI 環境會因為讀不到
# DIRECT_URL 而失敗」）。用 ENV 而不是單一 RUN 裡 export，因為下面 `pnpm install --prod` 那步
# 重新跑一次 install 時也會觸發同一個 postinstall，ENV 對整個 build stage 都有效。
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

# pnpm-workspace.yaml 是必要檔案：ultimate-express 依賴的 uWebSockets.js 走 GitHub 安裝，
# pnpm 預設會擋（ERR_PNPM_EXOTIC_SUBDEP），一定要在 install 之前就存在。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm run build

# 只保留 production dependencies，縮小最終 image。這步會把 devDependencies 裡的 `prisma`（CLI）
# 移除，但 pnpm 還是會照 @prisma/client 自己 package.json 定義的 postinstall 再跑一次
# `prisma generate`——這時候 `prisma` 執行檔已經不在了，會直接失敗（sh: 1: prisma: not found）。
# client 在上面 `pnpm install --frozen-lockfile` 那步已經產生過，這裡不需要任何 postinstall
# 副作用，直接跳過（--ignore-scripts）。
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:26-trixie-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# 只是文件用途——實際監聽的 port 由 PORT 環境變數決定（src/shared/config.ts 預設 8084，
# Cloud Run 會注入 8080）。
EXPOSE 8080

# 不要在容器啟動時執行 migration——這裡只啟動 app，schema 變更另外用
# `pnpm prisma migrate deploy` 手動跑（對 DIRECT_URL，不是容器內部的職責）。
CMD ["node", "dist/index.js"]
