// [參賽版新增 2026-10-26] 部署參賽版之前跑一次:確認要上線的是參賽版自己的 Vercel 專案,跟正式站一點都沒連在一起。
// 本人 2026-10-26:「pairthis.app 和 wardrobe-gallery 正式站一行都不要碰,Vercel 專案、環境變數、Blob 都分開,這條每次部署前自己對一次」
// 用法(repo 根目錄,先 npx vite build && node tools/export-static.mjs):node tools/predeploy-check.mjs
// 全部 ✓ 才部署:vercel deploy --prod --yes --cwd contest-site
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const fail = (message) => { console.error(`✗ ${message}`); process.exitCode = 1; };
const ok = (message) => console.log(`✓ ${message}`);
const readJson = (path) => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };

// 1. contest-site/ 連到哪個 Vercel 專案
const link = readJson("contest-site/.vercel/project.json");
if (!link) fail("contest-site/.vercel/project.json 不見了:要先 vercel link --yes --project pairthis-youcam --cwd contest-site");
else if (link.projectName !== "pairthis-youcam") fail(`contest-site 連到 ${link.projectName},不是 pairthis-youcam`);
else ok("contest-site 連到 pairthis-youcam");

// 2. 跟正式站的專案 id 不一樣(正式站從 wardrobe-ai/wardrobe-gallery/ 部署;只讀它的連結檔,不碰)
const production = readJson("../wardrobe-ai/wardrobe-gallery/.vercel/project.json");
if (link && production && link.projectId === production.projectId) fail("專案 id 跟正式站 wardrobe-gallery 一樣");
else if (link && production) ok(`專案 id 跟正式站(${production.projectName || "wardrobe-gallery"})不同`);
else if (link) ok("找不到正式站的連結檔,只比了名字");

// 3. 環境變數只有 YOUCAM_API_KEY:正式站的 Blob token、同步、回報那些一個都不能在這裡
try {
  const list = execSync("vercel env ls production --cwd contest-site", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const names = [...list.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s+Encrypted/gm)].map((match) => match[1]);
  if (names.includes("YOUCAM_API_KEY")) ok("YOUCAM_API_KEY 在");
  else fail("少了 YOUCAM_API_KEY");
  const extra = names.filter((name) => name !== "YOUCAM_API_KEY");
  if (extra.length) fail(`多了別的環境變數:${extra.join(", ")}`);
  else ok("沒有其他環境變數(沒有 Blob token)");
} catch (error) {
  fail(`讀不到環境變數:${error.message.split("\n")[0]}`);
}

// 4. 匯出的 function 沒有用到 Blob,也沒有站主衣櫃、同步、回報
if (existsSync("contest-site/api")) {
  const files = readdirSync("contest-site/api");
  const blob = files.filter((file) => readFileSync(`contest-site/api/${file}`, "utf8").includes("@vercel/blob"));
  if (blob.length) fail(`這些 function 用到 Blob:${blob.join(", ")}`);
  else ok("沒有 function 用到 Blob");
  for (const file of ["closet.mjs", "sync.mjs", "feedback.mjs", "_owner-closet.mjs"]) if (files.includes(file)) fail(`不該有 api/${file}`);
} else fail("contest-site/api 不見了:先匯出");

// 5. vercel link 會在資料夾裡寫一個 .env.local(VERCEL_OIDC_TOKEN),不能跟著上傳
if (existsSync("contest-site/.env.local")) fail("contest-site/.env.local 還在(vercel link 寫的 token),刪掉再部署");
else ok("沒有 contest-site/.env.local");

// 6. 這個 repo 的 origin 不是正式站的 repo
try {
  const origin = execSync("git remote get-url origin", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (/wardrobe-gallery/i.test(origin)) fail(`origin 指到正式站的 repo:${origin}`);
  else ok(`origin 是 ${origin}`);
} catch {
  ok("還沒有 origin");
}

if (process.exitCode) console.error("有問題,先不要部署");
else console.log("全部 ✓,可以部署:vercel deploy --prod --yes --cwd contest-site");
