// [參賽版新增 2026-10-25] 試穿:把一張人像和一件衣服送去 YouCam AI Clothes(cloth-v4),拿回穿上之後的照片。
// 線上 function(functions/tryon.mjs)和開發伺服器(scripts/tryon-api.mjs)共用這一份。
//
// 流程(docs.perfectcorp.com/reference/ai_clothes,2026-10-25 讀):
//   1. POST /file 報上檔案大小 → 拿到 file_id 和一個上傳網址,把 JPEG PUT 上去(人像、衣服各一次)
//   2. POST /task/cloth-v4 { src_file_id, ref_file_id, garment_category } → task_id
//   3. GET  /task/cloth-v4/<task_id> 等 task_status 變成 success / error;成功的結果是一個下載網址
// 結果圖由這裡下載、轉成 data URL 回給網頁:網頁的 CSP 不用多開 YouCam 的網域,照片也不會留一個外部網址在瀏覽器裡。
//
// 金鑰是環境變數 YOUCAM_API_KEY,只在伺服器。每次試穿扣 YouCam 的點數(文件寫 V2/V3 每次 2 點,V4 沒寫),
// 點數用完 API 就回錯,不會刷卡;所以這裡的上限是為了讓評審期間還有點數,不是為了錢。

import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://yce-api-01.makeupar.com/s2s/v2.0";
export const CATEGORIES = new Set(["upper_body", "outer", "lower_body", "full_body", "shoes", "auto"]);
const MAX_IMAGE = 3 * 1024 * 1024;     // 網頁先縮到長邊 1280、JPEG,正常 200–600KB;超過就是沒縮
const TASK_ID = /^[A-Za-z0-9_-]{8,128}$/;
const TICKET_TTL = 23 * 3600 * 1000;   // YouCam 的 task 留 24 小時

// 查結果只認伺服器簽過的「票」(task.到期.簽名),不認 YouCam 原本的 task_id:試穿照上有臉,
// 別人拿到或猜到一個 task_id 也領不走(2026-10-25 安全審查)。簽名的鑰匙從 YouCam 金鑰導出,不多一個環境變數
const signer = (key) => createHmac("sha256", key).update("pairthis-tryon-ticket").digest();
const sign = (key, body) => createHmac("sha256", signer(key)).update(body).digest("base64url");
function makeTicket(key, task) {
  const body = `${task}.${Date.now() + TICKET_TTL}`;
  return `${body}.${sign(key, body)}`;
}
function readTicket(key, ticket) {
  const parts = String(ticket || "").split(".");
  if (parts.length !== 3 || !TASK_ID.test(parts[0]) || !/^\d+$/.test(parts[1])) return "";
  const body = `${parts[0]}.${parts[1]}`;
  const want = Buffer.from(sign(key, body));
  const got = Buffer.from(parts[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "";
  if (Number(parts[1]) < Date.now()) return "";
  return parts[0];
}

// 每個 IP 一天最多開幾次試穿、全站(這一台 function)一天最多幾次。記在記憶體,Vercel 開好幾台時各算各的,
// 跟 _rate-limit.mjs 一樣是擋大量亂打;真正的天花板是帳戶裡的點數
// [參賽版修改 2026-10-26] 15→40:評審多半在同一間公司、同一個對外網址,15 次是全部人加起來(驗收抓到)。
// 同日 40→100、150→300:規則要評審期間免費、不設限制(Testing),上限只留來擋一個人把點數用光,正常評審碰不到
const PER_IP_DAY = 100;
const PER_INSTANCE_DAY = 300;
const daily = new Map();
let dayKey = "";
let instanceCount = 0;

function ipOf(request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

function takeDaily(request) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; daily.clear(); instanceCount = 0; }
  const ip = ipOf(request);
  const used = daily.get(ip) || 0;
  if (used >= PER_IP_DAY) return "ip";
  if (instanceCount >= PER_INSTANCE_DAY) return "site";
  daily.set(ip, used + 1);
  instanceCount += 1;
  return "";
}

const json = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function youcam(key, path, { method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.status && data.status !== 200)) {
    const error = new Error(data.error_code || data.error || `YouCam 回 ${response.status}`);
    error.status = response.status;
    error.code = data.error_code || data.error || "";
    throw error;
  }
  return data.data || {};
}

/** data:image/jpeg;base64,… → Buffer;不是 JPEG/PNG 或太大就回 null */
function decodeImage(dataUrl) {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE) return null;
  return { bytes, type: `image/${match[1]}` };
}

async function upload(key, image, name) {
  const data = await youcam(key, "/file", {
    method: "POST",
    body: { files: [{ content_type: image.type, file_name: name, file_size: image.bytes.length }] },
  });
  const file = data.files?.[0];
  const put = file?.requests?.[0];
  if (!file?.file_id || !put?.url) throw new Error("YouCam 沒給上傳網址");
  const response = await fetch(put.url, {
    method: put.method || "PUT",
    headers: put.headers || { "Content-Type": image.type },
    body: image.bytes,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`上傳照片失敗(${response.status})`);
  return file.file_id;
}

/** POST { person, garment, category }:兩張都是 data URL。回 { task } */
export async function startTryOn(request, key) {
  if (!key) return json(503, { error: "not_configured" });
  const input = await request.json().catch(() => null);
  const person = decodeImage(input?.person);
  const garment = decodeImage(input?.garment);
  const category = CATEGORIES.has(input?.category) ? input.category : "";
  if (!person || !garment || !category) return json(400, { error: "bad_request" });
  const limited = takeDaily(request);
  if (limited) return json(429, { error: limited === "ip" ? "daily_limit" : "site_busy" });
  const ext = (image) => (image.type === "image/png" ? "png" : "jpg");
  const [src, ref] = await Promise.all([upload(key, person, `person.${ext(person)}`), upload(key, garment, `garment.${ext(garment)}`)]);
  const task = await youcam(key, "/task/cloth-v4", {
    method: "POST",
    body: { src_file_id: src, ref_file_id: ref, garment_category: category },
  });
  if (!task.task_id || !TASK_ID.test(task.task_id)) throw new Error("YouCam 沒給 task_id");
  return json(200, { task: makeTicket(key, task.task_id) });
}

/** GET ?task=<票>:還在跑回 { status: "running" };好了回 { status: "done", image };失敗回 { status: "error", error } */
export async function checkTryOn(request, key) {
  if (!key) return json(503, { error: "not_configured" });
  const task = readTicket(key, new URL(request.url).searchParams.get("task"));
  if (!task) return json(400, { error: "bad_request" });
  const data = await youcam(key, `/task/cloth-v4/${encodeURIComponent(task)}`);
  const status = data.task_status;
  if (status === "error") return json(200, { status: "error", error: data.error || "error" });
  if (status !== "success") return json(200, { status: "running" });
  const url = data.results?.url || data.results?.[0]?.url;
  if (!url || !/^https:\/\//.test(url)) return json(200, { status: "error", error: "no_result" });
  const result = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!result.ok) return json(200, { status: "error", error: "download_failed" });
  const type = (result.headers.get("content-type") || "image/jpeg").split(";")[0];
  const bytes = Buffer.from(await result.arrayBuffer());
  return json(200, { status: "done", image: `data:${type};base64,${bytes.toString("base64")}` });
}

/** YouCam 的錯誤碼原樣回給網頁(網頁翻成一句話),其他錯誤只回 502 */
export function tryOnFailure(error) {
  if (error?.status === 401) return json(502, { error: "InvalidAccessToken" });
  // 點數用完:YouCam 文件沒寫錯誤碼(2026-10-26 查 FAQ),402 和帶 credit／unit 字樣的都當成點數用完
  if (error?.status === 402 || /credit|unit|insufficient|quota/i.test(error?.code || "")) return json(502, { error: "out_of_units" });
  if (error?.code) return json(502, { error: error.code });
  return json(502, { error: "upstream" });
}
