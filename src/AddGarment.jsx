// [本 fork 新增] 上游 tandpfun/wardrobe 沒有此檔,整份由本 fork 撰寫。
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, SpinnerGap, Storefront, X } from "@phosphor-icons/react";
import { cropBlob, deleteLocalItem, findUrl, garmentColors, guessPart, productUrlProblem, refillGaps, saveLocalItem, shrinkImage, trimTransparent } from "./localWardrobe.js";
import { PART_GROUPS, PART_ORDER, PARTS } from "./parts.js";
import { fetchBrandProduct, fetchProductPage, parseBrandLink, partFromName, partFromProduct, sameProduct } from "./brandLink.js";
import { findSameStyle, findSimilar, fitChoices, kindChoices, kindLabel } from "./wishCheck.js";
import { useDialog } from "./useDialog.js";
import { ScrollRail } from "./ScrollRail.jsx";
import { fixCutout, modelReady, preloadModel, preloadsEarly, removeBg } from "./cutout.js";
import { CURRENCIES, parsePrice } from "./price.js";
import { brandInUrl, brandOf, brandSuggestions, canonicalBrand } from "./brands.js";
import { track } from "./analytics.js";
import { TryOnPanel, useTryOn } from "./TryOn.jsx";   // [參賽版新增 2026-10-25] YouCam 試穿

/** 店裡比一下:還沒買、還沒存的這件也能試穿;key 用這次去背的圖,換一件就是新的 */
function StoreTryOn({ draft }) {
  const state = useTryOn({ garmentKey: draft.blob ? `store|${draft.preview}` : "", garmentSrc: draft.preview, part: draft.part });
  return <TryOnPanel state={state} compact />;
}

// 分類清單在 src/parts.js(新增的選單照組排:衣服、鞋襪、配件、小物)

const FULL = { x: 0, y: 0, w: 1, h: 1 };

// 去背(載模型、排隊、在 Worker 裡算)在 src/cutout.js

/* 在照片上拖一個框。座標存成 0–1,和照片實際解析度無關。
   手指點下去常常會動 1–3px,舊版一動就把框重畫成一個點,按鈕變灰也不說原因(審查 F32):移動不到 8px 不算拖。 */
const DRAG_THRESHOLD = 8;
function CropBox({ src, box, onChange }) {
  const frameRef = useRef(null);
  const startRef = useRef(null);

  const point = (event) => {
    const rect = frameRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const down = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { at: point(event), x: event.clientX, y: event.clientY, dragging: false };
  };
  const move = (event) => {
    const start = startRef.current;
    if (!start) return;
    if (!start.dragging) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return;
      start.dragging = true;
    }
    const a = start.at;
    const b = point(event);
    onChange({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  };
  const up = () => { startRef.current = null; };

  return (
    <div className="crop-frame" ref={frameRef}>
      <img src={src} alt="Photo to crop" draggable="false" />
      <div
        className="crop-surface"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {/* 框外變暗用四塊長方形鋪在照片上。舊版用框的大陰影(9999px),iPhone 上會蓋出照片、把整個視窗和
            「去背框起來的」一起蓋暗,框好了按鈕看起來還是灰的(2026-10-04 本人 iPhone 截圖) */}
        <div className="crop-dim" style={{ left: 0, top: 0, width: "100%", height: `${box.y * 100}%` }} />
        <div className="crop-dim" style={{ left: 0, top: `${(box.y + box.h) * 100}%`, width: "100%", bottom: 0 }} />
        <div className="crop-dim" style={{ left: 0, top: `${box.y * 100}%`, width: `${box.x * 100}%`, height: `${box.h * 100}%` }} />
        <div className="crop-dim" style={{ left: `${(box.x + box.w) * 100}%`, top: `${box.y * 100}%`, right: 0, height: `${box.h * 100}%` }} />
        <div
          className="crop-rect"
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
        />
      </div>
    </div>
  );
}

/* 品牌圖庫:一格一張,載不到的(那件沒有第 N 張)自己藏起來。 */
function ImagePicker({ images, onPick }) {
  const [failed, setFailed] = useState(() => new Set());
  const [loaded, setLoaded] = useState(0);
  const allFailed = failed.size === images.length;
  // 載不到分不出是沒網路、被擋還是真的下架,不要猜「可能下架了」(審查 F60)
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <>
      <div className="pick-grid">
        {images.map((image, index) => !failed.has(index) && (
          <button key={image.thumb} type="button" className="pick-cell" onClick={() => onPick(image)} aria-label={`Use image ${index + 1}`}>
            <img
              src={image.thumb}
              alt=""
              loading="lazy"
              onLoad={() => setLoaded((count) => count + 1)}
              onError={() => setFailed((current) => new Set(current).add(index))}
            />
          </button>
        ))}
      </div>
      {allFailed && (
        <p className="add-field-error">
          {offline ? "You're offline, so the product image can't load. Try again when you're online, or use a screenshot." : "This product image won't load (the link may be wrong, or the brand blocks it). Use a screenshot instead."}
        </p>
      )}
      {!allFailed && loaded === 0 && <small className="add-hint">Loading…</small>}
    </>
  );
}

/* 去背套件只收 PNG、JPEG、WebP。LONGINES 的商品圖是 AVIF,整張去背直接失敗(2026-10-04 正式站實測
   「Invalid format: image/avif」);其他格式先讓瀏覽器解開、轉成 PNG。轉不了(瀏覽器也不認得)就照原樣,讓去背自己報錯 */
const CUTOUT_TYPES = /^image\/(png|jpeg|webp)$/;
async function toCutoutFormat(file) {
  if (CUTOUT_TYPES.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new File([blob], "photo.png", { type: "image/png" }) : file;
  } catch {
    return file;
  }
}

/** 價錢欄:數字＋幣別。抓得到的已經填好;手動填的預設新台幣。也給單品頁用 */
export function PriceField({ value, currency, onChange, hint = "Optional", id = "price" }) {
  return (
    <div className="add-field price-field">
      <label htmlFor={`${id}-amount`}>Price</label>
      <div className="price-row">
        <select aria-label="Currency" value={currency || "TWD"} onChange={(event) => onChange(value, event.target.value)}>
          {CURRENCIES.map(([code, symbol]) => <option key={code} value={code}>{symbol}</option>)}
        </select>
        <input
          id={`${id}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value, currency || "TWD")}
          placeholder="E.g. 1290"
        />
      </div>
      {hint && <small className="add-hint">{hint}</small>}
    </div>
  );
}

/** 長邊超過 max 就等比縮小(PNG);沒超過原樣回傳。 */
async function limitSide(blob, max) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) { bitmap.close?.(); return blob; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return (await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))) || blob;
}

/* 去背失敗講真正的原因。舊版一律「可能是照片太大或網路斷線」,真機上壞了也看不出是哪一個
   (2026-10-05 本人 iPhone 4G 兩格訊號、框皮帶去背失敗)。最後附上原始錯誤,截圖回報才查得到 */
function cutoutErrorText(cause) {
  const raw = `${cause?.name || ""} ${cause?.message || cause || ""}`.trim();
  // 記憶體先判:WASM 記憶體不夠時錯誤長得像「Aborted(OOM)」,不能被下面的 abort 當成斷線
  if (/memory|oom|allocation|rangeerror|out of bounds|aborted\(/i.test(raw)) {
    return `This image is too big for the phone's memory. Crop a smaller area or close other tabs and try again. (${raw.slice(0, 80)})`;
  }
  if (/load failed|failed to fetch|networkerror|network|fetch|timeout|aborterror/i.test(raw)) {
    return `The background-removal model didn't finish downloading (about 80 MB; weak mobile signal often cuts it off). Connect to Wi-Fi and tap again. (${raw.slice(0, 80)})`;
  }
  return `Background removal failed. Tap again; if it still fails, try another photo. (${raw.slice(0, 80) || "no error message"})`;
}

const PAD = 0.1;
// 店裡比一下的快速分類:店裡最常比的五類,其他的收在「其他…」
const STORE_PARTS = ["upperbody", "wholebody_up", "lowerbody", "shoes", "bag"];
/** 店裡比一下的品名:打的字 + 點的版型、款式(例「UNIQLO 寬版T恤」),拿去比對,存的話也存成這個名字 */
// 參賽版是英文:版型和款式中間要空格(「slim shirt」),黏成「slimshirt」就對不到 \bshirt\b
const storeName = (draft) => [draft.name.trim(), draft.fit, draft.kind].filter(Boolean).join(" ");

/** 框往外多留 10% 再去背:框得太貼,模型看不到背景,中間色的條紋會被去成半透明、旁邊留一條陰影(審查 F19)。去背完再裁回原本的框。 */
function expandBox(region) {
  const x = Math.max(0, region.x - region.w * PAD);
  const y = Math.max(0, region.y - region.h * PAD);
  const right = Math.min(1, region.x + region.w * (1 + PAD));
  const bottom = Math.min(1, region.y + region.h * (1 + PAD));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * @param onAdded 存好之後叫,帶兩個參數:這件是不是存進「想買的」、存成什麼名字
 * @param existing 這個衣櫃已經有的(含想買的),存檔前拿來比對有沒有重複;站主是全部,訪客只有自己加的
 * @param openRequest 大於 0 就打開新增(空衣櫃、推薦失敗的「加入第一件衣服」按鈕用);打開後叫 onOpenHandled 讓呼叫端歸零,
 *        不然切到入口再回來、這個元件重新掛上時又會自己打開
 */
/**
 * 新增衣物;也能換掉一件衣服的圖(2026-10-06 本人要的)。
 * @param replaceRequest { item, n }:n 每次換新就打開「換圖」;流程一樣(照片/商品圖 → 框 → 去背),最後只把圖換上去
 * @param onReplaced (item, blob) 換好的那張
 * @param hideButton 不畫自己的「新增」鈕(換圖專用的那一份)
 */
/**
 * 在店裡比一下(2026-10-10 本人:「在現場挑衣服的時候開啟網站然後掃描,就可以跟家裡的衣櫃比對」):
 * 拍一張 → 框 → 去背(拿去背後的顏色)→ 點分類 → 家裡像的幾件、買了能配哪幾套,跟想買的單品頁「值不值得買」同一套算法。
 * 不存也行,按「不用了」什麼都不留。結果卡由 App 用 renderCheck(試算的這件, 已經有的) 畫(WishCheck 在 App 裡)。
 * 限制:店裡燈光偏黃,抓到的顏色會跟家裡拍的有落差,「同色」可能漏抓;分類照片認不出來,要人點。
 */
export function AddGarment({ onAdded, existing = [], openRequest = 0, onOpenHandled = null, replaceRequest = null, onReplaced = null, hideButton = false, onAddOne = null, renderCheck = null }) {
  const inputRef = useRef(null);
  const retakeRef = useRef(false);   // 這次選照片是「重拍一張」:填好的留著
  const cameraRef = useRef(null);          // 店裡比一下:直接開相機的那一個
  const [store, setStore] = useState(false);
  const dialogRef = useRef(null);
  const [stage, setStage] = useState("idle"); // idle | source | store | pick | crop | working | review
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [source, setSource] = useState(null); // { file, url }
  const [box, setBox] = useState(FULL);
  const [draft, setDraft] = useState(null);
  const [linkText, setLinkText] = useState("");
  const [link, setLink] = useState(null); // parseBrandLink 的結果,貼了連結才有
  const [replacing, setReplacing] = useState(null);   // 換圖模式:要換掉圖的那件
  const runRef = useRef(0);                // 每次下載商品圖、去背都換一號;取消或逾時就換號,晚回來的結果丟掉
  const watchdogRef = useRef(null);
  const cutRef = useRef(null);             // 這次去背的原料(送去背的照片、模型給的結果、框):按「補滿」時不用重算模型
  const [refilling, setRefilling] = useState(false);
  const partRef = useRef("");              // 去背好那一刻選的分類(眼鏡不自動補實,見 cutoutFix.js)
  partRef.current = draft?.part || "";
  // 衣櫃還空著(一件已經有的都沒有;想買的、垃圾桶裡的不算):貼連結預設「已經有了」(2026-10-23 本人定)。
  // 入口叫新手「網購過的貼連結」,舊預設是「想買」,想買的不算衣櫃、不會配第一套,照著做就卡住
  const closetEmpty = !existing.some((item) => !item.wishlist && !item.trashedAt);

  /* 返回手勢(iPhone 從左緣側滑):舊版會直接離開網站,剛去背好的結果全丟(審查 F34)。
     打開新增時押一筆歷史,返回就只關掉新增;已經去背好的先問一聲。用 UI 關掉時自己把那一筆吃掉。 */
  const historyRef = useRef(false);
  const pushHistory = () => {
    if (historyRef.current) return;
    try { window.history.pushState({ addGarment: true }, ""); historyRef.current = true; } catch { /* 不支援就算了 */ }
  };

  const clear = () => {
    runRef.current += 1;
    clearTimeout(watchdogRef.current);
    cutRef.current = null;
    if (draft?.preview) URL.revokeObjectURL(draft.preview);
    if (source?.url) URL.revokeObjectURL(source.url);
    setDraft(null);
    setSource(null);
    setBox(FULL);
    setStage("idle");
    setStatus("");
    setLinkText("");
    setLink(null);
    setReplacing(null);
    setStore(false);
    retakeRef.current = false;
  };
  const reset = () => {
    clear();
    if (historyRef.current) { historyRef.current = false; window.history.back(); }
  };
  const clearRef = useRef(clear);
  clearRef.current = clear;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  useEffect(() => {
    const onPop = () => {
      if (!historyRef.current) return;   // 自己 history.back() 吃掉的那一筆,或新增沒開著
      historyRef.current = false;
      if (stageRef.current === "idle") return;
      if (stageRef.current === "review" && !window.confirm("Discard the piece you just cut out?")) { pushHistory(); return; }
      clearRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      clearTimeout(watchdogRef.current);
    };
  }, []);

  const open = () => {
    setError("");
    setStore(false);
    setStage("source");
    pushHistory();
    preloadModel();
  };
  const openStore = () => {
    setError("");
    setStore(true);
    setStage("store");
    pushHistory();
    preloadModel();   // 開這一頁就先下載模型(省流量、2G 除外):等拍完、框好,通常已經下載好了
    track("店裡比一下");
  };
  useEffect(() => {
    if (!openRequest) return;
    open();
    onOpenHandled?.();
  }, [openRequest]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!replaceRequest?.item) return;
    setReplacing(replaceRequest.item);
    open();
  }, [replaceRequest?.n]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Esc、✕、取消、返回手勢:去背好的那一步先問(焦點一進來就在 ✕ 上,按一下 Enter 不該把算了半分鐘的結果丟掉),其他直接關
  const requestClose = () => {
    if (store) { reset(); return; }   // 店裡比一下是試算,關掉不用問
    if (stage === "review" && !window.confirm(replacing ? "Keep the current image?" : draft?.blob ? "Discard the piece you just cut out?" : "Discard this piece? What you filled in won't be kept.")) return;
    reset();
  };
  // 處理中按取消:回到上一步,照片和框都留著(審查 F4)。模型那邊停不下來,晚回來的結果丟掉
  const cancelWork = () => {
    runRef.current += 1;
    clearTimeout(watchdogRef.current);
    setStatus("");
    setStage(source ? "crop" : link?.images.length ? "pick" : "source");
  };
  const showing = stage !== "idle";
  useDialog(dialogRef, stage === "working" ? cancelWork : requestClose, { active: showing, watch: stage });

  const linkProblem = productUrlProblem(linkText);
  const parsedLink = linkText.trim() && !linkProblem ? parseBrandLink(linkText) : null;

  // 其他品牌:貼上就在背景讀商品頁(停 350ms 等貼完),讀到圖就跟 GU 一樣挑圖;擋機器人、讀不到就照舊用截圖
  const pageUrl = parsedLink?.page ? parsedLink.url : null;
  const [pageInfo, setPageInfo] = useState(null);   // { url, status: loading|ok|blocked|empty, name, brand, images, error }
  useEffect(() => {
    if (!pageUrl) return undefined;
    setPageInfo({ url: pageUrl, status: "loading", images: [] });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchProductPage(pageUrl, controller.signal).then((data) => {
        const status = data.images.length ? "ok" : data.blocked ? "blocked" : "empty";
        setPageInfo({ url: pageUrl, status, name: data.name || "", brand: data.brand || "", images: data.images, price: data.price || null, error: data.error || "" });
      }).catch(() => { /* 換了網址,這次的不要了 */ });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [pageUrl]);
  const page = pageUrl && pageInfo?.url === pageUrl ? pageInfo : null;
  const pageLoading = Boolean(pageUrl) && (!page || page.status === "loading");
  const effectiveLink = (() => {
    if (!parsedLink?.page || !page || page.status === "loading") return parsedLink;
    // 品牌:商品頁寫的優先,統一寫法(adidas → Adidas);沒寫就用網域猜的。舊版直接塞網域「beams.co.jp」
    const brand = canonicalBrand(page.brand) || parsedLink.brand || "";
    // 品名:分享文字裡的優先;商品頁讀到的補上品牌(品名裡已經有就不重複)
    const pageName = page.name && brand && !page.name.toLowerCase().includes(brand.toLowerCase()) ? `${page.name} (${brand})` : page.name;
    const name = parsedLink.name || pageName || "";
    // 品名猜不出分類就看網址(LONGINES 的品名沒有「錶」,網址是 /p/watch-longines-…)
    const slug = decodeURIComponent(new URL(parsedLink.url).pathname).replace(/[-_/.]+/g, " ");
    return { ...parsedLink, brand, name, images: page.images, part: partFromName(name) || partFromName(slug) || null, price: page.price || null };
  })();
  // 貼上連結的那一步就講加過了沒(審查 F31):舊版要等去背完才說,白等一輪
  const linkDupe = useMemo(
    () => (parsedLink?.url && !parsedLink.notProduct ? existing.find((item) => item.sourceUrl && sameProduct(item.sourceUrl, parsedLink.url)) : null),
    [parsedLink?.url, parsedLink?.notProduct, existing],   // eslint-disable-line react-hooks/exhaustive-deps
  );

  const applyLink = () => {
    const chosen = effectiveLink;
    setLink(chosen);
    // GU、UNIQLO:品名在背景問,挑圖、去背照常進行;回來時如果名稱還空著才填,不蓋掉手打的
    if (chosen?.lookup) {
      fetchBrandProduct(chosen.lookup).then((product) => {
        if (!product) return;
        const name = `${product.name} (${chosen.brand})`;
        const part = partFromProduct(product.name, product.categories);
        setLink((current) => (current?.url === chosen.url ? { ...current, name, part, price: product.price || current.price || null } : current));
        setDraft((current) => {
          if (!current || current.sourceUrl !== chosen.url) return current;
          const next = { ...current };
          if (!current.name) { next.name = name; next.part = current.part || part || ""; }
          // 價錢晚一點才回來:欄位還空著才填,不蓋掉手打的
          if (!current.price && product.price) { next.price = String(product.price.amount); next.priceCurrency = product.price.currency || "TWD"; }
          return next;
        });
      });
    }
    if (chosen?.images.length) setStage("pick");
    else inputRef.current?.click();
  };

  /* 下載品牌的大圖再進框選;大圖失敗就退回挑圖時看到的那張。 */
  const pickBrandImage = async (image) => {
    const run = ++runRef.current;
    setStage("working");
    setError("");
    setStatus("Downloading product image…");
    try {
      let response = await fetch(image.full);
      if (!response.ok) response = await fetch(image.thumb);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (run !== runRef.current) return;
      pick(new File([blob], "brand.jpg", { type: blob.type || "image/jpeg" }), { fromBrand: true });
    } catch (cause) {
      if (run !== runRef.current) return;
      console.error(cause);
      setError(navigator.onLine === false ? "You're offline, so the product image can't download." : "The product image didn't download. Pick another, or use a screenshot.");
      setStage("pick");
    }
  };

  /* keepDraft:「重拍一張」(2026-10-22)換的是同一件,已經填的名稱、分類留著;預覽網址交給 cutout 收。
     fromBrand:商品圖,不是自己拍的,不用提醒拉平皺摺 */
  const pick = async (file, { keepDraft = false, fromBrand = false } = {}) => {
    if (!file) return;
    setError("");
    const usable = await toCutoutFormat(file);
    if (keepDraft) setDraft((current) => current && { ...current, pending: false });
    else setDraft((current) => { if (current?.preview) URL.revokeObjectURL(current.preview); return null; });
    setSource({ file: usable, url: URL.createObjectURL(usable), fromBrand });
    setBox(FULL);
    setStage("crop");
    preloadModel();
  };

  /* 去背:先把表單打開,去背在背景算(2026-10-05)。第一次要下載約 80MB 的模型,4G 上要等好一陣子,
     舊版這段只有一個轉圈,等完才開始填名稱、分類;現在等的同時就能填,去背好了預覽換成去背圖、存檔鈕才亮。
     失敗了表單和填好的字都留著,可以「再試一次」或回去重新框。 */
  const cutout = async (region) => {
    const run = ++runRef.current;
    const alive = () => run === runRef.current;
    setError("");
    setStatus("Reading photo…");
    const fail = (message) => {
      clearTimeout(watchdogRef.current);
      setError(message);
      setStatus("");
      setDraft((current) => current && { ...current, pending: false });
    };
    // 看門狗只管下載:60 秒沒有任何下載進度就停(舊版卡住時永遠停在「讀取照片…」,Esc、點外面都沒用)。
    // 開始算之後不計時:iPad gen 7 光推論就可能超過 45 秒,要停就按取消
    const arm = () => {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (!alive()) return;
        runRef.current += 1;
        fail("The background-removal model download stalled. Check your connection and tap “Try again”.");
      }, 60000);
    };
    try {
      const outer = region === FULL ? FULL : expandBox(region);
      // 送去背前先縮到長邊 1600:模型本來就只看 1024,iPhone 的整張截圖(1179×2556)原尺寸丟進去只是吃記憶體
      const input = await limitSide(outer === FULL ? source.file : await cropBlob(source.file, outer), 1600);
      if (!alive()) return;
      // 表單先開,預覽先放框起來的照片。「再試一次」「重新框」回來的,已經填的留著
      setDraft((current) => {
        if (current?.preview) URL.revokeObjectURL(current.preview);
        const kept = current?.region ? current : null;
        return {
          id: kept?.id || `local-${Date.now()}`,
          region,
          pending: true,
          blob: null,
          preview: URL.createObjectURL(input),
          name: kept ? kept.name : link?.name || "",
          // 長寬比猜分類一直猜錯(短褲→鞋、外套→下身),沒有品名可以看就留空讓人選
          part: kept ? kept.part : link?.part || partFromName(link?.name) || "",
          color: null,
          secondaryColor: null,
          // 貼了商品連結才預設「還沒買」;從相簿選的多半是自己已經有的。衣櫃還空著時例外,貼連結也當已經有了(見 closetEmpty)
          wishlist: kept ? kept.wishlist : store || (Boolean(link?.url) && !closetEmpty),
          dream: kept ? Boolean(kept.dream) : false,   // 夢想區(2026-10-08):還沒買的另一層,很想要、還沒打算買
          sourceUrl: kept ? kept.sourceUrl : link?.url || "",
          // 價錢:商品頁或 GU、UNIQLO 讀得到就先填好,讀不到留空讓人填
          price: kept ? kept.price : link?.price?.amount ? String(link.price.amount) : "",
          // 品牌:商品連結讀得到就先填(GU、UNIQLO、其他品牌的商品頁)
          brand: kept ? kept.brand : link?.brand || "",
          priceCurrency: kept ? kept.priceCurrency : link?.price?.currency || "TWD",
        };
      });
      setStage("review");
      setStatus("Getting ready to remove the background…");
      arm();
      const raw = await removeBg(input, (text, downloading) => {
        if (!alive()) return;
        setStatus(text);
        if (downloading) arm(); else clearTimeout(watchdogRef.current);
      });
      if (!alive()) return;
      clearTimeout(watchdogRef.current);
      setStatus("Cleaning up the edges…");
      cutRef.current = { input, raw, outer, region };
      const { blob, color, secondaryColor } = await finishCutout(cutRef.current, false);
      if (!alive()) return;
      setDraft((current) => {
        if (!current) return current;
        if (current.preview) URL.revokeObjectURL(current.preview);
        return { ...current, blob, preview: URL.createObjectURL(blob), color, secondaryColor, pending: false, filled: false };
      });
      setStatus("");
    } catch (cause) {
      if (!alive()) return;
      console.error(cause);
      fail(cutoutErrorText(cause));
      if (stageRef.current !== "review") setStage("crop");
    }
  };
  /* 模型給的結果 → 補洞補實(白衣服白底被吃掉的,cutoutFix.js)→ 補條紋縫 → 裁回原本的框 → 去掉透明邊、縮小 → 抓顏色。
     strong = 按了「補滿」:更白的衣服模型連一大塊都很有把握地判成背景,自動補不了,交給人看預覽決定 */
  const finishCutout = async ({ input, raw, outer, region }, strong) => {
    let clean = await refillGaps(input, await fixCutout(input, raw, { part: partRef.current, strong }));
    if (outer !== FULL) {
      clean = await cropBlob(clean, {
        x: (region.x - outer.x) / outer.w, y: (region.y - outer.y) / outer.h,
        w: region.w / outer.w, h: region.h / outer.h,
      });
    }
    const blob = await shrinkImage((await trimTransparent(clean)).blob);
    return { blob, ...(await garmentColors(blob)) };
  };
  // 「補滿」和「還原」:同一份模型結果重做後半段
  const toggleFill = async () => {
    const saved = cutRef.current;
    if (!saved || !draft?.blob || refilling) return;
    const run = runRef.current;
    const strong = !draft.filled;
    setRefilling(true);
    setError("");
    try {
      const { blob, color, secondaryColor } = await finishCutout(saved, strong);
      if (run !== runRef.current) return;
      setDraft((current) => {
        if (!current) return current;
        if (current.preview) URL.revokeObjectURL(current.preview);
        return { ...current, blob, preview: URL.createObjectURL(blob), color, secondaryColor, filled: strong };
      });
    } catch (cause) {
      console.error(cause);
      if (run === runRef.current) setError(`Filling in didn't work: ${cause?.message || cause}`);
    } finally {
      setRefilling(false);
    }
  };
  // 「補滿」只給淺色的(2026-10-25 新訪客實測:深咖啡裙也跳「白色衣服被去掉一塊?補滿」)。看去背後抓到的主色、副色,
  // 亮度 150 以上才出現(170 太緊:暗光拍的白襯衫被吃掉一塊後只剩 178–181,驗收);已經補過的照樣留著,才按得到「還原」
  const isLight = (hex) => { if (!hex) return false; const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) >= 150; };
  const fillToggle = () => draft?.blob && cutRef.current && (draft.filled || isLight(draft.color) || isLight(draft.secondaryColor)) && (
    <div className="add-fill">
      <button type="button" className="add-fill-button" onClick={toggleFill} disabled={refilling} aria-pressed={Boolean(draft.filled)}>
        {refilling ? "Filling in…" : draft.filled ? "Back to the original cutout" : "Part of a white piece cut away? Fill it in"}
      </button>
      <small className="add-hint">
        {draft.filled ? "Gaps enclosed by bag straps or handles were filled in too; if that's wrong, go back." : "Use this when both the piece and the background are white. Gaps enclosed by bag straps get filled too, so check the preview."}
      </small>
    </div>
  );

  // 失敗後:同一個框再算一次(填好的字留著),或回去重新框
  const retryCutout = () => { if (draft?.region) cutout(draft.region); };
  const backToCrop = () => {
    runRef.current += 1;
    clearTimeout(watchdogRef.current);
    cutRef.current = null;
    setError("");
    setStatus("");
    setDraft((current) => current && { ...current, pending: false });
    setStage("crop");
  };

  /* 皺摺提醒(2026-10-22,本人看示範衣櫃截圖:皺的衣服去背後還是皺,掛上人台很難看)。
     不做偵測:瀏覽器裡沒有皺摺模型,土法會把針織紋路、印花當成皺,誤判一次就把人擋在最煩的那一步。
     只在自己拍的照片上提醒;商品圖、商品頁截圖、店裡比一下不提 */
  const ownPhoto = !store && !source?.fromBrand && !link?.url;
  const brandPick = !store && Boolean(source?.fromBrand);   // 從商品頁挑的商品圖(不是截圖、不是自己拍的)
  const retake = () => { retakeRef.current = true; inputRef.current?.click(); };

  const tooSmall = box.w < 0.05 || box.h < 0.05;
  const urlError = draft ? productUrlProblem(draft.sourceUrl) : "";
  const urlInvalid = Boolean(urlError);

  // 防呆:同一個商品連結貼第二次,或櫃裡已經有同款同色的,存之前先講(不擋,按鈕改成「還是要存」)
  const draftUrl = draft?.wishlist ? findUrl(draft.sourceUrl) : null;
  const sameLink = useMemo(
    () => (draftUrl ? existing.find((item) => item.sourceUrl && sameProduct(item.sourceUrl, draftUrl)) : null),
    [draftUrl, existing],
  );
  const similar = useMemo(
    () => (draft?.part ? findSimilar({ part: draft.part, name: draft.name, color: draft.color }, existing) : []),
    [draft?.part, draft?.name, draft?.color, existing],
  );
  const dupes = sameLink ? [sameLink] : similar;
  // 「數量 +1」只給真的同一款(同連結,或品名、品牌、細節、顏色都對得上);只是「很像」的照樣提醒,但不給 +1(2026-10-08)
  const sameStyle = useMemo(
    () => (draft?.part ? findSameStyle({ id: null, part: draft.part, name: draft.name, color: draft.color, brand: draft.brand || undefined, sourceUrl: draftUrl }, existing, { brandOf, sameProduct }) : []),
    [draft?.part, draft?.name, draft?.color, draft?.brand, draftUrl, existing],
  );
  // 很像的分成已經有的、想買的:只比到想買的那件,舊版還是寫「櫃裡已經有 1 件」(審查 F57)
  const similarText = () => {
    const kind = kindLabel({ part: draft.part, name: draft.name });
    const owned = similar.filter((item) => !item.wishlist).length;
    const wished = similar.length - owned;
    if (owned && wished) return `Already in your closet: ${owned} like this (${kind}, same color), plus ${wished} on your wishlist. Add it anyway?`;
    if (owned) return `Already in your closet: ${owned} like this (${kind}, same color). Add it anyway?`;
    return `Already on your wishlist: ${wished} like this (${kind}, same color). Add it anyway?`;
  };

  const replace = () => {
    if (!draft?.blob || !replacing) return;
    onReplaced?.(replacing, draft.blob);
    reset();
  };

  const draftState = draft;
  // over:店裡比一下的「放進想買的」「買了」直接帶著選擇存,不用先改 draft 再存
  const save = async (over = {}) => {
    const draft = { ...draftState, ...over };
    const name = draft.name.trim() || (draft.wishlist ? "Wishlist piece" : "New piece");
    setError("");
    // 分類改選填(2026-10-21,行銷企劃第 0 週:MYMIKA 加一件零欄位,我們要人選分類才能存)。
    // 沒選就猜:先看品名(「襯衫」「牛仔褲」),再看去背後的長寬比;猜的標 partGuessed,衣櫃格子會提醒點一下改
    let partGuessed = false;
    if (!draft.part) {
      let guessed = partFromName(name);
      if (!guessed && draft.blob) {
        try { const bitmap = await createImageBitmap(draft.blob); guessed = guessPart(bitmap.width, bitmap.height); bitmap.close?.(); } catch { /* 讀不到就當上衣 */ }
      }
      draft.part = guessed || "upperbody";
      partGuessed = true;
    }
    // 存不進去要講(2026-10-21 iPad 無痕實測:舊版沒接這個錯,按了「加入衣櫃」什麼都沒發生,表單也不關)
    try {
      await saveLocalItem({
        id: draft.id,
        name,
        part: draft.part,
        color: draft.color,
        secondaryColor: draft.secondaryColor,
        tags: [],
        blob: draft.blob,
        wishlist: draft.wishlist,
        dream: draft.wishlist && Boolean(draft.dream),
        sourceUrl: draft.wishlist ? findUrl(draft.sourceUrl) : null,
        price: parsePrice(draft.price),
        priceCurrency: draft.priceCurrency || "TWD",
        // 填了才存;沒填之後看品名、網址猜。已經有的不存網址,所以商品連結的網域讀到的品牌要現在存
        brand: canonicalBrand(draft.brand) || brandInUrl(link?.url) || undefined,
        partGuessed,
      });
    } catch (cause) {
      console.error(cause);
      setError(/quota/i.test(`${cause?.name} ${cause?.message}`)
        ? "This device is out of space and can't save this image. Free up some space and tap again."
        : "This browser won't let the site save clothes; private or incognito tabs are the usual cause. Open it in a normal tab and add it again.");
      return;
    }
    try { navigator.storage?.persist?.(); } catch { /* 不支援就算了 */ }
    track("加衣服", { 種類: draft.wishlist ? (draft.dream ? "夢幻逸品" : "想買") : "已經有" });
    // 漏斗(2026-10-21):自己加的、已經有的,加到第 1 件和第 5 件各記一次(existing 是存之前的清單)
    if (!draft.wishlist) {
      const owned = existing.filter((item) => item.isLocal && !item.wishlist && !item.trashedAt).length + 1;
      if (owned === 1) track("第 1 件");
      if (owned === 5) track("第 5 件");
    }
    onAdded(draft.wishlist, name, draft.wishlist && Boolean(draft.dream), draft.id);
    reset();
  };

  const closeButton = (label = "Cancel") => (
    <button type="button" className="add-close" onClick={requestClose} aria-label={label}>
      <X size={20} weight="light" aria-hidden="true" />
    </button>
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => { const keepDraft = retakeRef.current; retakeRef.current = false; pick(event.target.files?.[0], { keepDraft }); event.target.value = ""; }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }}
      />

      {!hideButton && (
        <button
          type="button"
          className="add-garment-button"
          onClick={open}
          disabled={stage === "working"}
        >
          {stage === "working"
            ? <><SpinnerGap size={14} className="add-spinner" aria-hidden="true" /> Working</>
            : <><Plus size={14} weight="bold" aria-hidden="true" /> Add</>}
        </button>
      )}
      {!hideButton && renderCheck && (
        <button type="button" className="add-garment-button add-store-button" onClick={openStore} disabled={stage === "working"}>
          <Storefront size={14} weight="bold" aria-hidden="true" /> In a store?
        </button>
      )}

      {stage === "store" && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Compare in store" ref={dialogRef}>
          <div className="add-panel add-panel-review">
            {closeButton()}
            <p className="add-step">Compare in store</p>
            <small className="add-hint">Take a photo of the piece you're looking at, crop it and pick a category. You'll see how many similar pieces you own and what it pairs with. No need to save it.</small>
            <small className="add-hint">
              {modelReady()
                ? "Photos are processed on this device and never uploaded."
                : preloadsEarly()
                  ? "The first time, it downloads an 80 MB background-removal model, starting when you open this page; open this page once on Wi-Fi at home first. Photos are processed on this device and never uploaded."
                  : "The first time, it downloads an 80 MB background-removal model when you remove a background; try it once on Wi-Fi at home first. Photos are processed on this device and never uploaded."}
            </small>
            <div className="add-actions">
              <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>From photos</button>
              <button type="button" className="primary-button" onClick={() => cameraRef.current?.click()}>Take a photo</button>
            </div>
          </div>
        </div>
      )}

      {stage === "source" && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label={replacing ? "Change image" : "Add a piece"} ref={dialogRef}>
          <form
            className="add-panel add-panel-review"
            onSubmit={(event) => { event.preventDefault(); if (parsedLink && !parsedLink.notProduct && !pageLoading) applyLink(); }}
          >
            {closeButton()}
            <p className="add-step">{replacing ? `Change image: ${replacing.name || "this piece"}` : "Add a piece"}</p>
            {replacing && <small className="add-hint">Pick a photo or paste a product link, crop the piece, remove the background, then swap it in. Name, category and color stay the same.</small>}
            {/* 貼連結放大門(2026-10-21):網購過的不用拍(商品圖照樣去背,只是省掉拍和框);拍照是沒連結時的第二條路 */}
            {!replacing && <small className="add-hint add-lead">Clothes you bought online are fastest: on the product page, tap “Share”, copy the link and paste it below. No photo needed. No link? Take a photo instead.</small>}
            <label className="add-field">
              <span>Paste a product link</span>
              {/* type="text" 不是 "url":App「分享」拷出來的是「快來看看【品名】… https://…」整段,
                  type="url" 會被瀏覽器當成不合法網址擋下來,按了沒反應(2026-10-03 WebKit 實測)。網址在 findUrl 裡挑出來 */}
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                value={linkText}
                onChange={(event) => setLinkText(event.target.value)}
                placeholder="https://"
                aria-invalid={Boolean(linkProblem)}
              />
              {linkProblem && <small className="add-field-error">{linkProblem}</small>}
            </label>
            <small className="add-hint" role="status">
              {parsedLink?.notProduct
                ? `That's a ${parsedLink.brand} link, but not a single product page. Open the product itself, tap Share, copy the link and paste it.`
                : pageLoading
                  ? "Reading the product page…"
                  : effectiveLink?.images.length
                    ? `${effectiveLink.brand} product images found${effectiveLink.page ? ` (${effectiveLink.images.length})` : ""}. Next, pick a flat-lay shot.`
                    : page?.status === "blocked"
                      ? `This site blocks automatic reading (big brands and Shopee often do). The link will be saved; next, choose a screenshot${effectiveLink?.name ? `; the name starts as “${effectiveLink.name}”` : ""}.`
                      : effectiveLink?.name
                        ? `Couldn't get images from ${effectiveLink.brand || "this site"}. The name starts as “${effectiveLink.name}”; next, choose a screenshot.`
                        : parsedLink
                          ? "No product images on this page. The link will be saved; next, choose a screenshot."
                          : "Paste a product link from a brand or shopping site. If it can be read, you pick an image right away; if not (like Shopee or Zara), use a screenshot."}
            </small>
            {linkDupe && (
              <small className="add-hint add-dupe-early" role="status">
               You've added this before: “{linkDupe.name}”{linkDupe.wishlist ? ", on your wishlist" : ", already in your closet"}. You can still add it again.
              </small>
            )}
            {/* 打開這頁(open)就開始下載去背模型,所以 80MB 要在這頁講,不是等到去背中才講(2026-10-24 取捨)。
                原本這裡是拍照前的皺摺提醒:還沒選要拍照就先講,太早;拍完、框衣服那一步有,附「重拍一張」 */}
            {/* 照實講什麼時候開始下載:一般是打開這頁就先載(2026-10-05 本人要的,選照片、框衣服時就載完);
                開了省流量或 2G 不先載(cutout.js 的 preloadsEarly),去背時才下載 */}
            {!modelReady() && (
              <small className="add-hint">
                {preloadsEarly()
                  ? "The first background removal downloads an 80 MB model, starting when you open this page. "
                  : "The first background removal downloads an 80 MB model when you start it; on mobile data, connect to Wi-Fi before choosing a photo. "}
                Photos are processed on this device and never uploaded.
              </small>
            )}
            <div className="add-actions">
              <button type="button" className="secondary-button" onClick={() => { setLink(parsedLink?.notProduct ? null : effectiveLink ? { ...effectiveLink, images: [] } : null); inputRef.current?.click(); }}>
                {parsedLink ? "Use a photo instead" : "No link? Take or choose a photo"}
              </button>
              <button type="submit" className="primary-button" disabled={!parsedLink || parsedLink.notProduct || pageLoading}>
                {pageLoading ? "Reading…" : effectiveLink?.images.length ? "List product images" : "Choose screenshot"}
              </button>
            </div>
          </form>
        </div>
      )}

      {stage === "pick" && link && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Pick a product image" ref={dialogRef}>
          <div className="add-panel add-panel-review">
            {closeButton()}
            <p className="add-step">Pick a flat-lay shot</p>
            {link.name && <small className="add-hint">{link.name}</small>}
            <small className="add-hint">
             The shot of the piece on its own cuts out cleanest{link.lookup ? "; it's usually one of the last few" : ""}. On a model shot, the person stays in too.
            </small>
            <ImagePicker images={link.images} onPick={pickBrandImage} />
            <div className="add-actions">
              <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>Use a screenshot instead</button>
            </div>
          </div>
        </div>
      )}

      {stage === "crop" && source && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Crop the piece" ref={dialogRef}>
          <div className="add-panel add-panel-review">
            {closeButton()}
            {/* 挑好的商品圖(2026-10-25 新訪客實測):原本跟截圖共用「截圖的話…」那句,「去背框起來的」又灰著,以為非框不可。
                商品圖多半整張去背就好:主按鈕換成「整張去背」,框是選用的 */}
            <p className="add-step">{brandPick ? "Remove the background of this product image" : "Drag to crop the piece"}</p>
            <small className="add-hint">
              {store
                ? "Leave the hanger, nearby clothes and your hand outside the box so the color comes out right."
                : brandPick
                  ? "For a product image, just tap “Remove whole background”. If there's a logo or something else in it, drag to crop the piece first."
                  : ownPhoto
                    ? "Hang it up or lay it flat and smooth out wrinkles before the photo; the cutout gets much cleaner. For a screenshot, leave the status bar and price outside the box."
                    : "For a screenshot, leave the status bar, price and buttons outside the box. On a model shot the person stays after the cutout, so pick the flat-lay one if you can."}
              {ownPhoto && <> <button type="button" className="add-text-button" onClick={retake}>Retake</button></>}
            </small>
            <CropBox src={source.url} box={box} onChange={setBox} />
            {box !== FULL && tooSmall && <small className="add-field-error" role="status">That box is too small. Drag a new one.</small>}
            <div className="add-actions">
              {brandPick ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => cutout(box)} disabled={box === FULL || tooSmall}>Remove background in box</button>
                  <button type="button" className="primary-button" onClick={() => cutout(FULL)}>Remove whole background</button>
                </>
              ) : (
                <>
                  <button type="button" className="secondary-button" onClick={() => cutout(FULL)}>Remove whole background</button>
                  <button type="button" className="primary-button" onClick={() => cutout(box)} disabled={box === FULL || tooSmall}>
                   Remove background in box
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {stage === "working" && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Working" ref={dialogRef}>
          <div className="add-panel">
            <SpinnerGap size={30} className="add-spinner" aria-hidden="true" />
            <p role="status" aria-live="polite">{status}</p>
            <small>
              {modelReady() ? "" : "The first time, it downloads an 80 MB background-removal model; after that it's much faster. "}
              Photos are processed on this device and never uploaded.
            </small>
            <button type="button" className="secondary-button add-cancel" onClick={cancelWork}>Cancel</button>
          </div>
        </div>
      )}

      {stage === "review" && draft && replacing && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Confirm new image" ref={dialogRef}>
          <div className="add-panel add-panel-review">
            {closeButton()}
            <p className="add-step">Replace the image of “{replacing.name || "this piece"}”</p>
            <div className="add-replace-compare">
              <figure>
                <img src={replacing.thumbnail || replacing.image} alt="" />
                <figcaption>Current</figcaption>
              </figure>
              <figure className={draft.blob ? "" : "is-pending"}>
                <img src={draft.preview} alt={draft.blob ? "New image" : "Cropped photo, background not removed yet"} />
                <figcaption>{draft.blob ? "New" : "Removing background"}</figcaption>
              </figure>
            </div>
            {fillToggle()}
            {draft.pending && (
              <p className="add-preview-status" role="status" aria-live="polite">
                <SpinnerGap size={16} className="add-spinner" aria-hidden="true" />{status}
              </p>
            )}
            {!draft.pending && !draft.blob && (
              <div className="add-retry" role="alert">
                <p>{error || "Background removal didn't finish."}</p>
                <div className="add-actions">
                  <button type="button" className="secondary-button" onClick={backToCrop}>Crop again</button>
                  <button type="button" className="primary-button" onClick={retryCutout}>Try again</button>
                </div>
              </div>
            )}
            <small className="add-hint">Name, category and color stay the same. If the color should follow the new image, use the color picker in edit mode afterward.</small>
            <div className="add-actions">
              <button type="button" className="secondary-button" onClick={requestClose}>Cancel</button>
              <button type="button" className="primary-button" onClick={replace} disabled={!draft.blob}>
                {draft.blob ? "Use this image" : "Ready once the background is removed"}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === "review" && draft && store && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Compare in store: result" ref={dialogRef}>
          <div className="add-panel add-panel-review">
            {closeButton("Never mind")}
            <div className={draft.blob ? "add-preview-wrap add-store-preview" : "add-preview-wrap add-store-preview is-pending"}>
              <img className="add-preview" src={draft.preview} alt={draft.blob ? "Cutout result" : "Cropped photo, background not removed yet"} />
              {draft.pending && (
                <p className="add-preview-status" role="status" aria-live="polite">
                  <SpinnerGap size={16} className="add-spinner" aria-hidden="true" />{status}
                </p>
              )}
            </div>
            {!draft.pending && !draft.blob && (
              <div className="add-retry" role="alert">
                <p>{error || "Background removal didn't finish."}</p>
                <div className="add-actions">
                  <button type="button" className="secondary-button" onClick={backToCrop}>Crop again</button>
                  <button type="button" className="primary-button" onClick={retryCutout}>Try again</button>
                </div>
              </div>
            )}

            <fieldset className="add-store-parts">
              <legend>This piece is</legend>
              {STORE_PARTS.map((part) => (
                <label key={part}>
                  <input
                    type="radio"
                    name="store-part"
                    checked={draft.part === part}
                    onChange={() => setDraft((current) => ({ ...current, part, kind: "", fit: "" }))}
                  />
                  <span>{PARTS[part].label}</span>
                </label>
              ))}
              <select
                value={STORE_PARTS.includes(draft.part) ? "" : draft.part}
                onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value, kind: "", fit: "" }))}
                aria-label="Other categories"
              >
                <option value="">Other…</option>
                {PART_ORDER.filter((part) => !STORE_PARTS.includes(part)).map((part) => (
                  <option key={part} value={part}>{PARTS[part].label}</option>
                ))}
              </select>
            </fieldset>

            {kindChoices(draft.part).length > 0 && (
              <fieldset className="add-store-parts">
                <legend>Style (comparisons get much more accurate if you pick one; otherwise only category and color count)</legend>
                {kindChoices(draft.part).map((kind) => (
                  <label key={kind}>
                    <input type="radio" name="store-kind" checked={draft.kind === kind} onChange={() => setDraft((current) => ({ ...current, kind }))} />
                    <span>{kind}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {fitChoices(draft.part).length > 0 && (
              <fieldset className="add-store-parts">
                <legend>Fit</legend>
                {["", ...fitChoices(draft.part)].map((fit) => (
                  <label key={fit || "none"}>
                    <input type="radio" name="store-fit" checked={(draft.fit || "") === fit} onChange={() => setDraft((current) => ({ ...current, fit }))} />
                    <span>{fit || "Can't tell"}</span>
                  </label>
                ))}
              </fieldset>
            )}

            <label className="add-field">
              <span>Brand or note (optional)</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="E.g. UNIQLO oxford"
              />
            </label>

            <div className="add-store-result" aria-live="polite">
              {!draft.part
                ? <p className="add-hint">Pick a category above to start comparing.</p>
                : !draft.blob
                  ? <p className="add-hint">{draft.pending ? "Comparing starts once the background is removed: the color comes from the cutout, not the background." : "Background removal didn't finish, so the color can't be compared."}</p>
                  : (
                    <>
                      {renderCheck({
                        id: "store-check", part: draft.part, name: storeName(draft), color: draft.color, secondaryColor: draft.secondaryColor,
                        tags: [], image: draft.preview, thumbnail: draft.preview, wishlist: true,
                      }, existing.filter((item) => !item.wishlist))}
                      <StoreTryOn draft={draft} />
                      <small className="add-hint">Store lighting differs from photos taken at home, so this compares “similar color”: navy and black, or off-white and white, may show up together. Judge by the thumbnails.</small>
                    </>
                  )}
            </div>

            <div className="add-actions add-store-actions">
              <button type="button" className="secondary-button" onClick={reset}>Never mind</button>
              <button type="button" className="primary-button" onClick={() => save({ wishlist: true, dream: false, name: storeName(draft) })} disabled={!draft.part || !draft.blob}>Add to wishlist</button>
            </div>
            <button type="button" className="add-store-bought" onClick={() => save({ wishlist: false, dream: false, name: storeName(draft) })} disabled={!draft.part || !draft.blob}>
             Bought it, add to closet
            </button>
          </div>
        </div>
      )}

      {stage === "review" && draft && !replacing && !store && (
        <div className="add-overlay" role="dialog" aria-modal="true" aria-label="Confirm the new piece" ref={dialogRef}>
          <div className="add-panel add-panel-review">
            {closeButton()}
            <div className={draft.blob ? "add-preview-wrap" : "add-preview-wrap is-pending"}>
              <img className="add-preview" src={draft.preview} alt={draft.blob ? "Cutout preview" : "Cropped photo, background not removed yet"} />
              {draft.pending && (
                <p className="add-preview-status" role="status" aria-live="polite">
                  <SpinnerGap size={16} className="add-spinner" aria-hidden="true" />{status}
                </p>
              )}
            </div>
            {fillToggle()}
            {ownPhoto && draft.blob && (
              <small className="add-hint add-retake">
               Looks wrinkled? Hang it up or smooth it out and take another; the name and category will stay.{" "}
                <button type="button" className="add-text-button" onClick={retake}>Retake</button>
              </small>
            )}
            {draft.pending && (
              <small className="add-hint">
                {modelReady() ? "Removing the background. Fill in the name and category meanwhile. " : "The first time, it downloads an 80 MB background-removal model. Fill in the name and category meanwhile. "}
                Photos are processed on this device and never uploaded.
              </small>
            )}
            {!draft.pending && !draft.blob && (
              <div className="add-retry" role="alert">
                <p>{error || "Background removal didn't finish."}</p>
                <div className="add-actions">
                  <button type="button" className="secondary-button" onClick={backToCrop}>Crop again</button>
                  <button type="button" className="primary-button" onClick={retryCutout}>Try again</button>
                </div>
              </div>
            )}

            {/* 「已經有了」排第一(2026-10-25 新訪客實測:排最後、窄螢幕掉到第二行還縮排不同,預設選中的那個反而最難看到)。
                順序 = 有了 → 想買 → 夢幻逸品;「這件」自己一行 */}
            <fieldset className="add-owned">
              <legend>This piece</legend>
              <label>
                <input
                  type="radio"
                  name="owned"
                  checked={!draft.wishlist}
                  onChange={() => setDraft((current) => ({ ...current, wishlist: false, dream: false }))}
                />
               I own it
              </label>
              <label>
                <input
                  type="radio"
                  name="owned"
                  checked={draft.wishlist && !draft.dream}
                  onChange={() => setDraft((current) => ({ ...current, wishlist: true, dream: false }))}
                />
               Want it
              </label>
              <label>
                <input
                  type="radio"
                  name="owned"
                  checked={draft.wishlist && Boolean(draft.dream)}
                  onChange={() => setDraft((current) => ({ ...current, wishlist: true, dream: true }))}
                />
               Dream piece
              </label>
            </fieldset>

            <label className="add-field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={draft.wishlist ? "E.g. GU wide-leg jeans" : "E.g. white canvas sneakers"}
              />
            </label>

            <label className="add-field">
              <span>Brand</span>
              <input
                value={draft.brand || ""}
                list="add-brand-options"
                autoComplete="off"
                onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}
                placeholder={brandOf({ name: draft.name }) ? `The name says ${brandOf({ name: draft.name })}, no need to fill this in` : "Optional, e.g. UNIQLO"}
              />
              <datalist id="add-brand-options">{brandSuggestions(existing).map((brand) => <option key={brand} value={brand} />)}</datalist>
            </label>

            <PriceField
              value={draft.price}
              currency={draft.priceCurrency}
              onChange={(price, priceCurrency) => setDraft((current) => ({ ...current, price, priceCurrency }))}
              hint={link?.price ? "Read from the product page; you can change it" : link?.url ? "No price on the product page; fill it in if you know it" : "Optional"}
            />

            <label className="add-field">
              <span>Category</span>
              <select
                value={draft.part}
                onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}
              >
                <option value="">Skip, guess for me</option>
                {PART_GROUPS.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.parts.map((part) => (
                      <option key={part} value={part}>{PARTS[part].label}{PARTS[part].hint ? ` (${PARTS[part].hint})` : ""}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {!draft.part && <small className="add-hint">You can save without one: it guesses from the name and shape. If it guesses wrong, open the piece in the closet and change it.</small>}
            </label>

            {draft.wishlist && (
              <label className="add-field">
                <span>Product link (optional, so you can get back to buy it)</span>
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  value={draft.sourceUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, sourceUrl: event.target.value }))}
                  placeholder="https://"
                  aria-invalid={urlInvalid}
                />
                {urlInvalid && <small className="add-field-error">{urlError}</small>}
              </label>
            )}

            {draft.wishlist && link?.url && (
              <small className="add-hint">Brand photos don't show in a public closet.</small>
            )}

            {dupes.length > 0 && (
              <div className="add-dupe" role="status">
                <p>
                  {sameLink
                    ? `This link was added before: “${sameLink.name}”${sameLink.wishlist ? ", on your wishlist" : ", already in your closet"}.`
                    : similarText()}
                </p>
                <div className="add-dupe-thumbs">
                  {dupes.slice(0, 4).map((item) => (
                    <img key={item.id} src={item.thumbnail || item.image} alt={item.name} title={item.name} />
                  ))}
                  {dupes.length > 4 && <span>+{dupes.length - 4} more</span>}
                </div>
                {/* 同一款又買了一件(2026-10-06):不另存一格,原本那件數量 +1 */}
                {onAddOne && !draft.wishlist && (sameLink && !sameLink.wishlist ? [sameLink] : sameStyle).some((item) => !item.wishlist) && (() => {
                  const target = (sameLink && !sameLink.wishlist ? [sameLink] : sameStyle).find((item) => !item.wishlist);   // 同一個連結、或同一款的那件(已經有的,不是想買的)
                  return (
                    <button type="button" className="add-dupe-one" onClick={() => { onAddOne(target); reset(); }}>
                     Same piece: don't save a new one, make “{target.name || "that piece"}” quantity +1
                    </button>
                  );
                })()}
              </div>
            )}

            <div className="add-actions">
              <button type="button" className="secondary-button" onClick={requestClose}>Cancel</button>
              <button type="button" className="primary-button" onClick={() => save()} disabled={urlInvalid || !draft.blob}>
                {!draft.blob ? "Save once the background is removed" : dupes.length ? "Save anyway" : draft.wishlist ? (draft.dream ? "Add to Dream pieces" : "Add to wishlist") : "Add to closet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showing && <ScrollRail target={dialogRef} watch={stage} />}
      {error && !(stage === "review" && draft && !draft.blob) && <p className="add-error" role="alert">{error}</p>}
    </>
  );
}

export { deleteLocalItem };
