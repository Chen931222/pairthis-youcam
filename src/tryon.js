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
// 還在等的 task 另存一格(2026-10-26 驗收抓到:「再試穿一次」先把 task 寫進同一格,舊的試穿照就被蓋掉,新的失敗連舊的也沒了)
const pendingKey = (photoId, garmentKey) => `${resultKey(photoId, garmentKey)}|pending`;
const fresh = (record) => record?.task && Date.now() - record.startedAt < 23 * 3600 * 1000;   // YouCam 的 task 只留 24 小時

/** 一件衣服在這張照片上的紀錄:{ task, startedAt } 還在等(優先)、{ blob } 試好了、null 沒試過 */
export async function readResult(photoId, garmentKey) {
  const pending = await run("results", "readonly", (store) => store.get(pendingKey(photoId, garmentKey))).catch(() => null);
  if (fresh(pending)) return { task: pending.task, startedAt: pending.startedAt };
  const record = await run("results", "readonly", (store) => store.get(resultKey(photoId, garmentKey))).catch(() => null);
  if (!record) return null;
  if (record.bytes) return { blob: toBlob(record), createdAt: record.createdAt };
  if (fresh(record)) return { task: record.task, startedAt: record.startedAt };   // 改版前存的等待中紀錄
  return null;
}

async function writeResult(photoId, garmentKey, value) {
  await putRecord("results", resultKey(photoId, garmentKey), value);
}

async function writePending(photoId, garmentKey, value) {
  await putRecord("results", pendingKey(photoId, garmentKey), value);
}

async function forgetPending(photoId, garmentKey) {
  await run("results", "readwrite", (store) => store.delete(pendingKey(photoId, garmentKey)));
}

export async function forgetResult(photoId, garmentKey) {
  await run("results", "readwrite", (store) => store.delete(resultKey(photoId, garmentKey)));
  await forgetPending(photoId, garmentKey);
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
    case "error_below_min_image_size": return "That photo is too small. It needs to be at least 512×384. Try a bigger one.";
    case "error_pose":
    case "error_invalid_src": return "Couldn't find a pose in this photo. It needs one person facing the camera, chest up, with shoulders and the whole face in view. Try another photo.";
    case "error_multi_person": return "There's more than one person in the photo. Use one with just you.";
    case "error_invalid_ref":
    case "error_apply_region_mismatch": return "Couldn't tell what kind of garment this is. Try an image of the whole piece, front view, laid flat.";
    case "error_nsfw_content_detected": return "This photo was blocked. Try another one.";
    case "exceed_max_filesize": return "That photo is too large. Try another one.";
    case "daily_limit": return "Today's try-ons from this internet connection are used up (40 a day). Come back tomorrow.";
    case "site_busy": return "Too many try-ons today. Try-on is paused until tomorrow.";
    case "rate": return "That was too fast. Wait a minute and try again.";
    case "timeout": return "Still not ready after two minutes. Close this for now; open this piece again later and the result will be there once it's done.";
    case "not_configured":
    case "InvalidAccessToken": return "Try-on isn't available right now (a setup problem on our side). It's not your photo.";
    case "out_of_units": return "Try-on is paused: this demo has used up its YouCam units. It's not your photo.";
    case "network": return "No connection. Try again when you're back online.";
    default: return `The try-on didn't work${code ? ` (${code})` : ""}. Try again in a moment.`;
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
    // 按「Stop waiting」時 fetch 會被中斷:那不是斷線,不要蓋掉 idle(驗收抓到)
    throw new TryOnError(options?.signal?.aborted ? "aborted" : "network");
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
      await forgetPending(photoId, garmentKey).catch(() => {});
      throw new TryOnError(body.error || "error");
    }
    if (body.status === "done" && body.image) {
      const blob = await (await fetch(body.image)).blob();
      await writeResult(photoId, garmentKey, { ...(await toRecord(blob)), createdAt: Date.now() });
      await forgetPending(photoId, garmentKey).catch(() => {});
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
  await writePending(photo.id, garmentKey, { task, startedAt: Date.now() });
  return awaitTryOn({ photoId: photo.id, garmentKey, task, signal, onTick });
}
