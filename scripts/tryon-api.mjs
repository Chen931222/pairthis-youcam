// [參賽版新增 2026-10-25] 開發伺服器上的 /api/tryon,和線上共用 functions/_tryon-core.mjs。
// 金鑰從 .env.local 的 YOUCAM_API_KEY 讀(不進 git);沒有金鑰時回 503,網頁會說「試穿還沒接上」。
import { readFileSync } from "node:fs";
import { startTryOn, checkTryOn, tryOnFailure } from "../functions/_tryon-core.mjs";

function readKey() {
  if (process.env.YOUCAM_API_KEY) return process.env.YOUCAM_API_KEY;
  try {
    const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("YOUCAM_API_KEY="));
    return line ? line.slice("YOUCAM_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : "";
  } catch { return ""; }
}

export function tryOnApi() {
  return {
    name: "tryon-api",
    configureServer(server) {
      server.middlewares.use("/api/tryon", async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const request = new Request(`http://localhost/api/tryon${req.url === "/" ? "" : req.url}`, {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] || "application/json", "x-forwarded-for": "127.0.0.1" },
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
        });
        const key = readKey();   // 每次讀:本人中途把金鑰貼進 .env.local,不用重開伺服器
        const run = req.method === "POST" ? startTryOn : checkTryOn;
        const response = await run(request, key).catch(tryOnFailure);
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(await response.text());
      });
    },
  };
}
