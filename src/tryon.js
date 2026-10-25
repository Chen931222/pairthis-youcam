// [參賽版新增 2026-10-25] 試穿(YouCam AI Clothes)的資料層:你的照片、試穿結果、送出與等結果。畫面在 TryOn.jsx。
//
// 照片和結果都只存在這台瀏覽器(IndexedDB,自己一個資料庫,不碰衣櫃那個)。按「試穿」時才把照片和那件衣服的圖
// 送到 /api/tryon,伺服器再轉給 YouCam;拿回來的結果圖也存回這台,下次打開同一件不用再花一次。
// 存的是位元組不是 Blob:Safari 無痕模式存 Blob 會失敗(2026-10-21 衣櫃踩過,見 localWardrobe.js)。
//
// 只有上衣和外套試得了:YouCam 的下身、鞋要「穿在人身上」的參考圖,衣櫃裡是平拍的單品(docs,2026-10-25)。

const DB_NAME = "pairthis-tryon";
const DB_VERSION = 1;
const PHOTO_KEY = "me";

/** 衣櫃的分類 → YouCam 的 garment_category;不在這裡的就不給試 */
export const TRY_ON_CATEGORY = { upperbody: "upper_body", wholebody_up: "outer" };
export const canTryOn = (part) => Boolean(TRY_ON_CATEGORY[part]);

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("photo");
        request.result.createObjectStore("results");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

async function run(store, mode, action) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const toRecord = async (blob) => ({ bytes: await blob.arrayBuffer(), type: blob.type || "image/jpeg" });
const toBlob = (record) => (record?.bytes ? new Blob([record.bytes], { type: record.type }) : null);

/** 你的照片:{ id, blob } 或 null */
export async function readPhoto() {
  const record = await run("photo", "readonly", (store) => store.get(PHOTO_KEY)).catch(() => null);
  return record ? { id: record.id, blob: toBlob(record), demo: Boolean(record.demo) } : null;
}

// put 要在同一個 transaction 裡同步呼叫;先把位元組準備好再開 transaction
async function putRecord(store, key, value) {
  return run(store, "readwrite", (s) => s.put(value, key));
}

export async function storePhoto(blob, options = {}) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await putRecord("photo", PHOTO_KEY, { id, demo: Boolean(options.demo), ...(await toRecord(blob)) });
  return id;
}

export async function deletePhoto() {
  await run("photo", "readwrite", (store) => store.delete(PHOTO_KEY));
  await run("results", "readwrite", (store) => store.clear());   // 照片拿掉,用它做的試穿照一起拿掉
}

const resultKey = (photoId, garmentKey) => `${photoId}|${garmentKey}`;

/** 一件衣服在這張照片上的紀錄:{ blob } 試好了、{ task, startedAt } 還在等、null 沒試過 */
export async function readResult(photoId, garmentKey) {
  const record = await run("results", "readonly", (store) => store.get(resultKey(photoId, garmentKey))).catch(() => null);
  if (!record) return null;
  if (record.bytes) return { blob: toBlob(record), createdAt: record.createdAt };
  if (record.task && Date.now() - record.startedAt < 23 * 3600 * 1000) return { task: record.task, startedAt: record.startedAt };
  return null;   // YouCam 的 task 只留 24 小時
}

async function writeResult(photoId, garmentKey, value) {
  await putRecord("results", resultKey(photoId, garmentKey), value);
}

export async function forgetResult(photoId, garmentKey) {
  await run("results", "readwrite", (store) => store.delete(resultKey(photoId, garmentKey)));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load"));
    image.src = src;
  });
}

function canvasBlob(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", quality));
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** 你的照片:長邊縮到 1280、轉 JPEG;太小(YouCam 最少 512×384)就丟錯 */
export async function preparePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const long = Math.max(image.naturalWidth, image.naturalHeight);
    const short = Math.min(image.naturalWidth, image.naturalHeight);
    if (long < 512 || short < 384) throw new Error("photo_small");
    const scale = Math.min(1, 1280 / long);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 衣服的圖:去背的透明 webp → 白底、留邊、直式 3:4 的 JPEG(YouCam 只收 jpg/png,商品圖要正面、單件) */
export async function prepareGarment(src) {
  const image = await loadImage(src);
  const width = 960;
  const height = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const scale = Math.min((width * 0.86) / image.naturalWidth, (height * 0.86) / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  return canvasBlob(canvas, 0.92);
}

/** 錯誤碼 → 一句話:問題是什麼、接下來怎麼做 */
export function tryOnMessage(code) {
  switch (code) {
    case "photo_small":
    case "error_below_min_image_size": return "照片太小了,至少要 512×384。換一張大一點的。";
    case "error_pose":
    case "error_invalid_src": return "這張照片認不出姿勢。要一個人正面站好、胸部以上入鏡,看得到肩膀和整張臉。換一張再試。";
    case "error_multi_person": return "照片裡不只一個人。換一張只有你的。";
    case "error_invalid_ref":
    case "error_apply_region_mismatch": return "這件的圖認不出是哪一種衣服。換一張正面、整件攤平的圖再試。";
    case "error_nsfw_content_detected": return "這張照片被擋下來了。換一張再試。";
    case "exceed_max_filesize": return "照片太大了。換一張再試。";
    case "daily_limit": return "這台今天的試穿次數用完了(一天 15 次),明天再來。";
    case "site_busy": return "今天試穿的人太多,試穿先停到明天。";
    case "rate": return "按得太快了,等一分鐘再試。";
    case "timeout": return "等了兩分鐘還沒好。先關掉,晚點再打開這件,好了會直接出現。";
    case "not_configured":
    case "InvalidAccessToken": return "試穿現在接不上(網站這邊的設定有問題),不是你的照片的問題。";
    case "network": return "連不上網路。網路好了再試一次。";
    default: return `試穿沒有成功${code ? `(${code})` : ""}。等一下再試一次。`;
  }
}

class TryOnError extends Error {
  constructor(code) { super(code); this.code = code; }
}

async function api(url, options) {
  let response;
  try {
    response = await fetch(url, { cache: "no-store", ...options });
  } catch {
    throw new TryOnError("network");
  }
  const body = await response.json().catch(() => ({}));
  if (response.status === 429 && !body.error?.startsWith?.("daily") && body.error !== "site_busy") throw new TryOnError("rate");
  if (!response.ok) throw new TryOnError(body.error || `http_${response.status}`);
  return body;
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new TryOnError("aborted")); }, { once: true });
});

/** 等一個已經送出的 task;好了存起來、回 blob */
export async function awaitTryOn({ photoId, garmentKey, task, signal, onTick }) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await wait(3000, signal);
    onTick?.(Date.now() - started);
    const body = await api(`/api/tryon?task=${encodeURIComponent(task)}`, { signal });
    if (body.status === "error") {
      await forgetResult(photoId, garmentKey).catch(() => {});
      throw new TryOnError(body.error || "error");
    }
    if (body.status === "done" && body.image) {
      const blob = await (await fetch(body.image)).blob();
      await writeResult(photoId, garmentKey, { ...(await toRecord(blob)), createdAt: Date.now() });
      return blob;
    }
  }
  throw new TryOnError("timeout");
}

/** 送出一次試穿:準備兩張圖 → POST → 記下 task(關掉頁面再打開還接得回來)→ 等結果 */
export async function startTryOn({ photo, garmentSrc, garmentKey, part, signal, onTick }) {
  const category = TRY_ON_CATEGORY[part];
  if (!category) throw new TryOnError("error_invalid_ref");
  const garment = await prepareGarment(garmentSrc).catch(() => { throw new TryOnError("error_invalid_ref"); });
  const [person, ref] = await Promise.all([blobToDataUrl(photo.blob), blobToDataUrl(garment)]);
  const { task } = await api("/api/tryon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person, garment: ref, category }),
    signal,
  });
  await writeResult(photo.id, garmentKey, { task, startedAt: Date.now() });
  return awaitTryOn({ photoId: photo.id, garmentKey, task, signal, onTick });
}
