// [參賽版新增 2026-10-25] /api/tryon 的 Vercel function 入口:規則在 _tryon-core.mjs。
// YOUCAM_API_KEY 是 Vercel 的環境變數,程式碼裡沒有金鑰。
// 開始試穿每個 IP 每分鐘 4 次(一天另有上限,見 core);查進度是每 2–3 秒一次,給到每分鐘 60 次。

import { overLimit, tooMany } from "./_rate-limit.mjs";
import { startTryOn, checkTryOn, tryOnFailure } from "./_tryon-core.mjs";

export const POST = async (request) => {
  const wait = overLimit(request, "tryon-start", 4);
  if (wait) return tooMany(wait);
  return startTryOn(request, process.env.YOUCAM_API_KEY).catch(tryOnFailure);
};

export const GET = async (request) => {
  const wait = overLimit(request, "tryon-check", 60);
  if (wait) return tooMany(wait);
  return checkTryOn(request, process.env.YOUCAM_API_KEY).catch(tryOnFailure);
};
