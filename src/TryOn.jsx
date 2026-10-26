// [參賽版新增 2026-10-25] 試穿(YouCam AI Clothes):單品頁和「店裡比一下」用的那一段。資料層在 tryon.js。
//
// 做什麼:放一張你的照片,按「試穿這件」,拿回這件穿在你身上的照片。結果在單品頁頂端當大圖(沿用上游
// modeledImage 那個版面),這一段只放照片、按鈕、進度和說明。
// 說清楚的三件事:照片只存在這台;按試穿才會上傳到 YouCam;結果是 AI 產生的,跟真的穿上可能不一樣。
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Sparkle, SpinnerGap } from "@phosphor-icons/react";
import {
  canTryOn, readPhoto, storePhoto, deletePhoto, preparePhoto, readResult, forgetResult,
  startTryOn, awaitTryOn, tryOnMessage,
} from "./tryon.js";

// 你的照片整個網站共用一份:單品頁換了照片,店裡比一下那邊也跟著換
let photoState = { loaded: false, photo: null, url: "" };
const listeners = new Set();
function setPhotoState(next) {
  if (photoState.url && photoState.url !== next.url) URL.revokeObjectURL(photoState.url);
  photoState = next;
  for (const listener of listeners) listener();
}
let loading = null;
function loadPhotoOnce() {
  if (!loading) {
    loading = readPhoto().then((photo) => {
      setPhotoState({ loaded: true, photo, url: photo?.blob ? URL.createObjectURL(photo.blob) : "" });
    });
  }
  return loading;
}
const subscribe = (listener) => { listeners.add(listener); loadPhotoOnce(); return () => listeners.delete(listener); };
const snapshot = () => photoState;

export function usePhoto() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

async function choosePhoto(file) {
  const blob = await preparePhoto(file);
  const id = await storePhoto(blob);
  setPhotoState({ loaded: true, photo: { id, blob }, url: URL.createObjectURL(blob) });
}

async function removePhoto() {
  await deletePhoto();
  setPhotoState({ loaded: true, photo: null, url: "" });
}

/**
 * 一件衣服的試穿狀態。garmentKey 換了(換一件、換圖)就重新讀;照片換了,舊照片的試穿照不用。
 * 回 { photo, photoUrl, status: idle|running|done|error, resultUrl, elapsed, error, tryOn, retry, discard, stopWaiting }
 */
export function useTryOn({ garmentKey, garmentSrc, part }) {
  const { photo, url: photoUrl } = usePhoto();
  const [status, setStatus] = useState("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const enabled = canTryOn(part) && Boolean(garmentKey);

  const showBlob = useCallback((blob) => {
    setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
    setStatus("done");
  }, []);

  const follow = useCallback(async (promise) => {
    try {
      showBlob(await promise);
    } catch (cause) {
      if (cause?.code === "aborted") return;
      setError(tryOnMessage(cause?.code));
      setStatus("error");
    }
  }, [showBlob]);

  // 打開這件:試過就直接給圖;上次送出還沒等到的,接著等
  useEffect(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setError("");
    setElapsed(0);
    setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return ""; });
    if (!enabled || !photo) return undefined;
    let live = true;
    readResult(photo.id, garmentKey).then((record) => {
      if (!live || !record) return;
      if (record.blob) { showBlob(record.blob); return; }
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("running");
      setElapsed(Date.now() - record.startedAt);
      follow(awaitTryOn({ photoId: photo.id, garmentKey, task: record.task, signal: controller.signal, onTick: () => setElapsed(Date.now() - record.startedAt) }));
    });
    return () => { live = false; abortRef.current?.abort(); };
  }, [enabled, photo, garmentKey, showBlob, follow]);

  const tryOn = useCallback(() => {
    if (!photo || !garmentSrc || status === "running") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setElapsed(0);
    setStatus("running");
    follow(startTryOn({ photo, garmentSrc, garmentKey, part, signal: controller.signal, onTick: setElapsed }));
  }, [photo, garmentSrc, garmentKey, part, status, follow]);

  // 不等了:送出去的那次照樣在 YouCam 跑完,下次打開這件會接著拿
  const stopWaiting = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
  }, []);

  const discard = useCallback(async () => {
    if (photo) await forgetResult(photo.id, garmentKey).catch(() => {});
    setResultUrl((old) => { if (old) URL.revokeObjectURL(old); return ""; });
    setStatus("idle");
  }, [photo, garmentKey]);

  return { enabled, photo, photoUrl, status, resultUrl, elapsed, error, tryOn, retry: tryOn, discard, stopWaiting };
}

function PhotoPicker({ label, onError, className = "secondary-button" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await choosePhoto(file);
      onError("");
    } catch (cause) {
      onError(tryOnMessage(cause?.message === "photo_small" ? "photo_small" : "error_invalid_src"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()} disabled={busy}>
        <Camera size={15} weight="regular" aria-hidden="true" /> {busy ? "Reading photo…" : label}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
    </>
  );
}

/** 單品頁、店裡比一下裡的那一段;state 是 useTryOn 的回傳 */
export function TryOnPanel({ state, compact = false }) {
  const { photo, photoUrl, status, elapsed, error, tryOn, retry, discard, stopWaiting, resultUrl } = state;
  const [photoError, setPhotoError] = useState("");
  const titleId = useId();
  if (!state.enabled) return null;
  const seconds = Math.max(0, Math.round(elapsed / 1000));

  return (
    <section className={compact ? "tryon is-compact" : "tryon"} aria-labelledby={titleId}>
      <h3 id={titleId}>Try it on you</h3>

      {!photo ? (
        <>
          <p className="tryon-lede">Add a photo of yourself to see this piece on you.</p>
          <p className="tryon-rule">Chest up, facing the camera, with your shoulders and whole face in view, and only you in the photo.</p>
          <div className="tryon-actions">
            <PhotoPicker label="Take or choose a photo" onError={setPhotoError} />
          </div>
        </>
      ) : (
        <>
          <div className="tryon-me">
            <img src={photoUrl} alt="Your photo" />
            <div className="tryon-me-text">
              <p>Try-ons use this photo.</p>
              <div className="tryon-me-actions">
                <PhotoPicker label="Change photo" onError={setPhotoError} className="tryon-link" />
                <button type="button" className="tryon-link" onClick={() => removePhoto().catch(() => {})}>Delete photo</button>
              </div>
            </div>
          </div>

          {status === "running" ? (
            <div className="tryon-status" role="status" aria-live="polite">
              <p><SpinnerGap size={16} className="add-spinner" aria-hidden="true" /> Making your try-on… {seconds} s so far. In two test runs it was ready in under 20 seconds.</p>
              <button type="button" className="tryon-link" onClick={stopWaiting}>Stop waiting</button>
            </div>
          ) : status === "done" ? (
            <div className="tryon-done" role="status">
              <p>The try-on photo is {compact ? "below" : "at the top"}. It's made by AI: color, length and fit may differ from the real thing on you.</p>
              {compact && resultUrl && <img className="tryon-result" src={resultUrl} alt="You wearing this piece (AI-generated try-on)" />}
              <div className="tryon-actions">
                <button type="button" className="secondary-button" onClick={retry}>
                  <Sparkle size={15} weight="regular" aria-hidden="true" /> Try on again
                </button>
                <button type="button" className="tryon-link" onClick={discard}>Delete this try-on</button>
              </div>
            </div>
          ) : (
            <div className="tryon-actions">
              <button type="button" className="secondary-button tryon-go" onClick={tryOn}>
                <Sparkle size={15} weight="regular" aria-hidden="true" /> Try this on
              </button>
            </div>
          )}
          {status === "error" && <p className="tryon-error" role="alert">{error}</p>}
        </>
      )}

      {photoError && <p className="tryon-error" role="alert">{photoError}</p>}
      <p className="tryon-privacy">
       Your photo stays on this device. When you tap “Try this on”, your photo and this piece's image are sent to YouCam (Perfect Corp.) to make the try-on, and the result is saved back here. Up to 40 try-ons a day from the same internet connection.
      </p>
    </section>
  );
}
