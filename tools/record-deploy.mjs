// 部署完登記一筆部署紀錄（2026-10-29 使用者核准，管理站的版本發布管理第二階段；名稱 data-rust 定，詞彙表二之七節）。各服務照抄。
// 在有 git 歷史的地方、部署成功之後跑（本機上傳的 Cloud Build 沒有 .git）：先問業務中台「這個服務上次部署的 commit」，用
// git log 算出上次以來的 commit，照 Conventional Commits 標出破壞性（標題的 `!` 或內文的 `BREAKING CHANGE:`），再 POST。
// 金鑰從 Secret Manager 讀、ID token 用 gcloud 的身分，都不印出來。DEV 記在業務中台 DEV、PRD 記在 PRD。
//
// 用法：node tools/record-deploy.mjs --service business-rust --environment dev --revision <Cloud Run revision> [--commit <sha>]
//   [--url <業務中台網址>] [--key-secret DEPLOY_RECORD_KEY_DEV] [--key-project oingg-business] [--deployed-by <email>]
// 也可以用環境變數 DEPLOY_RECORD_KEY 直接給金鑰（CI 用）；--environment prd 時另外寫一份到 DEV 的總帳，金鑰是 DEPLOY_RECORD_KEY_DEV（環境變數或 Secret）。
//
// 上次部署的 commit 不在本機歷史時，改問 GitHub 的 compare API（2026-11-17 加，使用者同意）：Cloud Build 的工作區是淺層 clone，私有 repo
// 也 unshallow 不了，原本只記這一次的 commit，一次推好幾個 commit 時前面的 BREAKING CHANGE 會漏記（證交所查到，管理站、公開觀測站也一樣）。
// 要 [--repo <owner/repo>]（沒給就從 git remote origin 推；Cloud Build 可以給 --repo $REPO_FULL_NAME）與只讀權杖：環境變數 GITHUB_READ_TOKEN，
// 或 oingg-business 的 Secret GITHUB_READ_TOKEN。拿不到權杖、或 GitHub 回錯時照舊只記這一次，並印警告，不讓部署步驟失敗。本機有完整歷史
// 的服務用不到權杖。
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// parseCommits 把 `git log --format=%H%x1f%s%x1f%b%x1e` 的輸出變成 commits[]（最多 200 個、新到舊）。
export function parseCommits(raw) {
  return raw
    .split('\x1e')
    .map((s) => s.replace(/^\n/, ''))
    .filter(Boolean)
    .slice(0, 200)
    .map((entry) => {
      const [sha, subject, body = ''] = entry.split('\x1f');
      // BREAKING CHANGE 的說明到空行或下一個 footer（`Token: 值`，例如 Co-Authored-By）為止（web-nuxt 2026-10-29 回報：原本會把結尾的
      // trailer 一起收進來，只寫冒號沒寫說明時還會跨過空行抓到下一段）。
      const footer = body.match(/^BREAKING[ -]CHANGE:[ \t]*(.*(?:\n(?![ \t]*\n|[A-Za-z][\w-]*: ).*)*)/m);
      const note = footer?.[1].trim() || null;
      return { sha, subject: subject.slice(0, 300), isBreaking: /^[a-z]+(\([^)]*\))?!:/.test(subject) || footer !== null, breakingNote: note?.slice(0, 2000) ?? null };
    });
}

// compareToLog 把 GitHub compare API 的 commits（舊到新、message 是標題＋空行＋內文）換成上面 git log 的格式（新到舊），交給 parseCommits。
export function compareToLog(commits) {
  return [...commits]
    .reverse()
    .map(({ sha, commit }) => {
      const [subject, ...rest] = commit.message.split('\n');
      return `${sha}\x1f${subject}\x1f${rest.join('\n').replace(/^\n/, '')}\x1e`;
    })
    .join('\n');
}

// 部署紀錄存在業務中台的庫裡（Go 與 Rust 共用，管理站經 Go 讀得到同一張表）。DEV 記在 Rust 自己的服務：Go 的服務清單沒有
// business-rust（Go 不改，2026-10-29 使用者），Rust 的 /deploy-records 有（R5，2026-10-30）。PRD 同理記在 Rust PRD（2026-10-30 建好）。
const URLS = {
  dev: 'https://oingg-business-rust-dev-xradmqyx5q-as.a.run.app',
  prd: 'https://oingg-business-rust-704437269028.asia-southeast1.run.app',
};

const sh = (cmd, list, shell = false) => execFileSync(cmd, list, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell });
// Windows 上 gcloud 是 .cmd，要經 shell（引數都是這支腳本自己組的）；git 不經 shell，cmd 會把 --format 裡的 %H 當成變數。
const gcloud = (...list) => sh('gcloud', list, process.platform === 'win32').replace(/\r?\n$/, '');

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]]] : [])));
  const need = (name) => args[name] ?? (console.error(`缺少 --${name}`), process.exit(2));
  const service = need('service');
  const environment = need('environment');
  const revision = need('revision');
  const base = args.url ?? URLS[environment];

  const keyFor = (env) =>
    (env === environment ? process.env.DEPLOY_RECORD_KEY : process.env[`DEPLOY_RECORD_KEY_${env.toUpperCase()}`]) ??
    gcloud('secrets', 'versions', 'access', 'latest', `--secret=${(env === environment && args['key-secret']) || `DEPLOY_RECORD_KEY_${env.toUpperCase()}`}`, `--project=${args['key-project'] ?? 'oingg-business'}`);
  // 服務帳號（CI）的 ID token 要指定 audience＝業務中台的網址，Cloud Run 才收；使用者帳號不能帶 --audiences（gcloud 會拒絕）。
  const account = gcloud('config', 'get-value', 'account');
  const idToken = async (audience) => {
    if (!account.endsWith('.gserviceaccount.com')) return gcloud('auth', 'print-identity-token');
    try {
      return gcloud('auth', 'print-identity-token', `--audiences=${audience}`);
    } catch {
      // Cloud Build 裡 gcloud 拿不到 ID token（metadata 不給，模擬身分也一樣；管理站 2026-10-29 實測），改用 IAM Credentials API
      // 幫自己簽：服務帳號要有對自己的 roles/iam.serviceAccountOpenIdTokenCreator。
      const res = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateIdToken`, {
        method: 'POST',
        headers: { authorization: `Bearer ${gcloud('auth', 'print-access-token')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ audience, includeEmail: true }),
      });
      if (!res.ok) throw new Error(`generateIdToken 回 ${res.status}: ${await res.text()}`);
      return (await res.json()).token;
    }
  };
  const headersFor = async (env, url) => ({ authorization: `Bearer ${await idToken(url)}`, 'x-oingg-deploy-key': keyFor(env), 'content-type': 'application/json' });
  const headers = await headersFor(environment, base);

  const commitSha = args.commit ?? sh('git', ['rev-parse', '--short', 'HEAD']).trim();
  const latest = await fetch(`${base}/deploy-records/latest?service=${encodeURIComponent(service)}&environment=${environment}`, { headers });
  if (latest.status !== 200 && latest.status !== 404) throw new Error(`GET /deploy-records/latest 回 ${latest.status}: ${await latest.text()}`);
  const previous = latest.status === 200 ? (await latest.json()).commitSha : null;

  const known = (sha) => {
    try {
      sh('git', ['cat-file', '-e', `${sha}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  };
  const orNull = (read) => {
    try {
      return read() || null;
    } catch {
      return null;
    }
  };
  // 上次的 commit 不在本機歷史（淺層 clone）時問 GitHub；拿不到就回 null，由下面只記這一個（第一次部署、或歷史被改寫也是只記這一個）。
  const fromGitHub = async (from, to) => {
    const repo = args.repo ?? orNull(() => sh('git', ['remote', 'get-url', 'origin']).trim().match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1]);
    const token =
      process.env.GITHUB_READ_TOKEN ??
      orNull(() => gcloud('secrets', 'versions', 'access', 'latest', '--secret=GITHUB_READ_TOKEN', `--project=${args['key-project'] ?? 'oingg-business'}`));
    const skip = (why) => (console.warn(`警告：上次部署的 ${from} 不在本機歷史，${why}，只記這一次的 commit`), null);
    if (!repo) return skip('也不知道 GitHub 的 repo（給 --repo <owner/repo>）');
    if (!token) return skip('也拿不到 GITHUB_READ_TOKEN');
    const res = await fetch(`https://api.github.com/repos/${repo}/compare/${from}...${to}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'oingg-record-deploy' },
    });
    if (!res.ok) return skip(`GitHub compare 回 ${res.status}`);
    const diff = await res.json();
    // shortcut: compare 一次最多回 250 個 commit（從最舊的算起），超過時只記回來的這些；真的有一次部署超過 250 個 commit 再改成分頁讀最後幾頁。
    if (diff.total_commits > diff.commits.length) console.warn(`警告：${from}...${to} 有 ${diff.total_commits} 個 commit，GitHub 只回了 ${diff.commits.length} 個`);
    return compareToLog(diff.commits);
  };
  const format = '--format=%H%x1f%s%x1f%b%x1e';
  const raw =
    previous && known(previous)
      ? sh('git', ['log', format, `${previous}..${commitSha}`])
      : ((previous && (await fromGitHub(previous, commitSha))) ?? sh('git', ['log', format, '-1', commitSha]));
  const commits = parseCommits(raw);

  const body = {
    service, environment, revision, commitSha, deployedAt: new Date().toISOString(),
    deployedBy: args['deployed-by'] ?? (account || null), commits,
  };
  const res = await fetch(`${base}/deploy-records`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status !== 201 && res.status !== 200) throw new Error(`POST /deploy-records 回 ${res.status}: ${await res.text()}`);
  const breaking = commits.filter((c) => c.isBreaking).length;
  console.log(`${res.status === 201 ? '登記' : '已經登記過'}：${service} ${environment} ${revision} ${commitSha}，${commits.length} 個 commit（${breaking} 個破壞性）${previous ? `，上次 ${previous}` : '，第一次登記'}`);

  // 業務中台 DEV 的表是所有環境的總帳（2026-10-30 使用者）：管理站 DEV 只讀得到 DEV 庫，要拿正式站的紀錄比對「DEV 有、正式站還沒有
  // 的破壞性變更」。所以正式站部署後同一個 body 再寫一份到 DEV（environment 維持 prd）；commit 範圍照舊用 PRD 的 latest 算。
  // 寫 DEV 失敗只警告，不讓部署步驟失敗（PRD 那筆已經寫好了）。用 --url 指定網址時不另寫。
  if (environment === 'prd' && !args.url) {
    try {
      const copy = await fetch(`${URLS.dev}/deploy-records`, { method: 'POST', headers: await headersFor('dev', URLS.dev), body: JSON.stringify(body) });
      if (copy.status !== 201 && copy.status !== 200) throw new Error(`回 ${copy.status}: ${await copy.text()}`);
      console.log(`  也記進 DEV 的總帳（${copy.status === 201 ? '新增' : '已經有了'}）`);
    } catch (error) {
      console.warn(`警告：正式站的紀錄沒能寫進 DEV 的總帳（${error.message}）。PRD 已經登記好；之後可以用同一個指令再跑一次補上`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
