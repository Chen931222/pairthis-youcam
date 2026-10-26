// [本 fork 新增] 入口右上「同步」打開的面板:開通、加入、換新碼、刪除雲端。規則在 sync.js。
// 訪客(canStart=false)只能「輸入同步碼」:開通只給站主,不然陌生人先按就把唯一的開通名額拿走了。
// 訪客輸入站主的碼 = 站主的另一台,加入後切成擁有者模式並重新整理,看到跟另一台一樣的衣櫃。
import { useEffect, useState } from "react";
import { becomeOwner } from "./ownerMode.js";
import {
  deleteCloud, formatCode, isValidCode, joinSync, lastSyncError, lastSynced, normalizeCode, rotateCode,
  startSync, stopSync, syncCode, syncNotice, syncNow, syncProgress,
} from "./sync.js";

const timeText = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

/* 現在這一步怎麼講(2026-10-07 本人:看不出現在在做什麼、有沒有同步完成) */
const stepText = (step) => {
  if (!step || step.phase === "start") return "Comparing with the cloud…";
  if (step.phase === "push") return step.total > 1 ? `Uploading this device's images ${Math.min(step.done + 1, step.total)} / ${step.total}…` : "Uploading this device's images…";
  if (step.phase === "pull") return step.total > 1 ? `Getting clothes from the cloud ${Math.min(step.done + 1, step.total)} / ${step.total}…` : "Getting clothes from the cloud…";
  return "";
};

/* 同步碼打到哪了:一直顯示格式,打錯當場講,不用等按了「加入」才知道 */
const codeHint = (typed) => {
  const code = normalizeCode(typed);
  if (!code) return { text: "16 letters and digits in groups of 4. Hyphens and case don't matter. There's no 0, O, 1 or I." };
  const lookalike = code.match(/[01OI]/)?.[0];
  if (lookalike) return { text: `Sync codes have no “${lookalike}”: 0, O, 1 and I never appear, so it's a look-alike character. Check again.`, bad: true };
  if (code.length < 16) return { text: `${code.length} / 16 characters.` };
  if (code.length > 16) return { text: `${code.length - 16} too many (${code.length} now, 16 needed).`, bad: true };
  return { text: "Format looks right.", ok: true };
};

export function SyncPanel({ canStart = true }) {
  const [code, setCode] = useState(syncCode);
  // 打開面板時先講最近一次的結果:上次失敗就說失敗、改動還沒上去,不要只寫「上次同步 HH:MM」(審查 F40)
  const [status, setStatus] = useState(() => (syncNotice() ? { error: syncNotice() }
    : lastSyncError() ? { error: lastSyncError() }
    : lastSynced() ? { at: lastSynced() } : null));
  const [busy, setBusy] = useState("");
  const [joining, setJoining] = useState(!canStart);
  const [typed, setTyped] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [step, setStep] = useState(syncProgress);   // 同步進行到哪(sync.js 的 wardrobe-sync-progress);null = 沒在同步
  // 同步碼等於整個衣櫃的鑰匙(2026-10-06 資安盤點):打開 60 秒自動收起;切到別的 app 馬上收起,
  // iPhone 的多工畫面會把當下的頁面截成縮圖,碼不該留在上面
  useEffect(() => {
    if (!showCode) return undefined;
    const timer = setTimeout(() => setShowCode(false), 60000);
    const onHide = () => { if (document.visibilityState === "hidden") setShowCode(false); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", onHide); };
  }, [showCode]);

  useEffect(() => {
    const onSynced = (event) => {
      setStatus(event.detail);
      setCode(syncCode());
      setStep(null);
    };
    const onProgress = (event) => setStep(event.detail);
    window.addEventListener("wardrobe-synced", onSynced);
    window.addEventListener("wardrobe-sync-progress", onProgress);
    return () => {
      window.removeEventListener("wardrobe-synced", onSynced);
      window.removeEventListener("wardrobe-sync-progress", onProgress);
    };
  }, []);

  // 每個動作都一樣:顯示進行中、做完收尾、出錯就把話講出來
  const act = async (label, work) => {
    setBusy(label);
    try {
      const result = await work();
      if (result?.error) setStatus({ error: result.error });
    } catch (error) {
      setStatus({ error: error?.message || String(error) });
    } finally {
      setBusy("");
      setCode(syncCode());
      setStep(syncProgress());
    }
  };

  const join = (event) => {
    event.preventDefault();
    const next = normalizeCode(typed);
    if (!isValidCode(next)) {
      // 打了 16 個字卻被說不對,多半是把長得像的字打成 0、O、1、I:同步碼裡不會有這四個(審查 F62)
      const lookalike = next.length === 16 && /[01OI]/.test(next);
      setStatus({ error: lookalike ? "Sync codes never contain 0, O, 1 or I; it's a look-alike character. Check again" : `A sync code is 16 letters and digits; this has ${next.length}. Check again` });
      return;
    }
    setStatus(null);
    act("Joining…", async () => {
      const result = await joinSync(next);
      if (!result.error && !canStart) setStatus({ joined: true, pulled: result.pulled || 0 });   // 重新整理之前那一下也講
      if (!result.error) {
        setJoining(false);
        setTyped("");
        if (!canStart) {
          // 重新整理之後講一聲加入了、拿到幾件(審查 F63:舊版直接跳回入口,沒有任何回饋)
          try { sessionStorage.setItem("open-wardrobe-joined", String(result.pulled || 0)); } catch { /* 看不到回饋而已 */ }
          becomeOwner();
          window.location.replace(window.location.pathname);   // 拿掉 ?edit=off、?public 這類參數,不然又被切回訪客
        }
      }
      return result;
    });
  };

  const rotate = () => {
    if (!confirm("Switch to a new code? The old code stops working right away, and other devices need to rejoin with the new one.")) return;
    act("Changing code…", async () => { await rotateCode(); setShowCode(true); });
  };

  const removeCloud = () => {
    if (!confirm("Delete the cloud copy? Clothes on this device stay, they just stop syncing; other devices stop syncing the next time they open.")) return;
    act("Deleting…", async () => { await deleteCloud(); setShowCode(false); setStatus(null); });
  };

  const stop = () => {
    if (!confirm("Stop syncing on this device? Clothes stay here, the cloud copy stays too, and other devices keep syncing.")) return;
    stopSync();
    setCode(null);
    setShowCode(false);
    setStatus(null);
  };

  // 最上面一行:現在是什麼狀態。進行中 > 剛加入 > 出錯 > 已同步 > 還沒開
  const hint = codeHint(typed);
  const working = busy || (code && step ? "Syncing" : "");
  let state = null;
  if (working) {
    const detail = busy === "Changing code…" ? "Moving the whole closet to the new code…" : busy === "Deleting…" ? "" : stepText(step);
    state = { kind: "busy", label: working.replace(/…$/, ""), detail };
  } else if (status?.joined) {
    state = { kind: "ok", label: "Joined", detail: status.pulled ? `Got ${status.pulled} from the other device. Reloading…` : "Reloading…" };
  } else if (status?.error) {
    state = { kind: "error", label: code ? "Sync didn't work" : "Couldn't join", detail: status.stopped || !code ? status.error : `This device's changes haven't been uploaded yet. ${status.error}` };
  } else if (code && status?.at) {
    const parts = [timeText(status.at)];
    if (status.pulled) parts.push(`Got ${status.pulled} from other devices`);
    state = { kind: "ok", label: "Synced", detail: `${parts.join(", ")}. This device matches the cloud.` };
  } else if (code) {
    state = { kind: "ok", label: "Sync is on", detail: "Not synced yet. Tap “Sync now”." };
  } else if (canStart && !joining) {
    state = { kind: "off", label: "Sync isn't on for this device", detail: "" };
  }

  return (
    <div className="studio-sync">
      {state && (
        <p className={`sync-state is-${state.kind}`} role="status" aria-live="polite">
          <span className="sync-state-label">{state.label}</span>
          {state.detail && <span className="sync-state-detail">{state.detail}</span>}
        </p>
      )}
      {(code || canStart) && (
      <div className="studio-backup-controls">
        {code ? (
          <>
            <button type="button" disabled={Boolean(busy)} onClick={() => act("Syncing…", syncNow)}>{busy || "Sync now"}</button>
            <button type="button" onClick={() => setShowCode((on) => !on)}>{showCode ? "Hide" : "Show sync code"}</button>
            <button type="button" disabled={Boolean(busy)} onClick={stop}>Stop</button>
          </>
        ) : (
          canStart && (
            <>
              <button type="button" disabled={Boolean(busy)} onClick={() => act("Setting up…", startSync)}>{busy && !joining ? busy : "Start syncing"}</button>
              <button type="button" onClick={() => setJoining((on) => !on)}>Enter sync code</button>
            </>
          )
        )}
      </div>
      )}

      {joining && !code && (
        <form className="studio-sync-join" onSubmit={join}>
          <label htmlFor="sync-code-input">Sync code from another device</label>
          <input
            id="sync-code-input"
            value={typed}
            onChange={(event) => { setTyped(event.target.value); if (status?.error) setStatus(null); }}
            onBlur={() => { const next = normalizeCode(typed); if (next) setTyped(formatCode(next)); }}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="sync-code-hint"
            aria-invalid={hint.bad || undefined}
          />
          <button type="submit" disabled={Boolean(busy)}>{busy || "Join"}</button>
          <small id="sync-code-hint" className={`sync-code-hint${hint.bad ? " is-bad" : hint.ok ? " is-ok" : ""}`}>{hint.text}</small>
        </form>
      )}

      {code && showCode && (
        <div className="studio-sync-manage">
          <p className="studio-sync-code">{formatCode(code)}</p>
          <div className="studio-backup-controls">
            <button type="button" disabled={Boolean(busy)} onClick={rotate}>New code</button>
            <button type="button" disabled={Boolean(busy)} onClick={removeCloud}>Delete cloud copy</button>
          </div>
          <p className="studio-backup-note studio-sync-warning">
           This code is the key to your whole closet: whoever has it can see and change your clothes. Don't screenshot it or send it in a message; to add a device, type it in while looking at this screen.
            If it went to the wrong person or you think it leaked, tap “New code” and the old one stops working right away. This closes by itself after a minute, or when you switch to another app.
          </p>
        </div>
      )}

      <p className="studio-backup-note">
        {code
          ? "On the other device, open “Sync” at the top right of the home screen and enter this code to see the same closet. Anyone with the code can see and change it, so don't post it anywhere public."
          : canStart
            ? "Clothes you added, your wishlist, wear log and saved outfits are encrypted before they go to the cloud. Only devices with the sync code can open them, so your phone and tablet stay the same."
            : "Sync is only for the site owner's own devices: on a device that already syncs, tap “Show sync code” and type the code here. To move clothes you added to another device, use “Export backup” and “Import backup” at the bottom of the Outfits page."}
      </p>
    </div>
  );
}
