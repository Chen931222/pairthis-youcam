# PairThis: see it on you, then see what it goes with

A closet app that dresses you from the clothes you already own. For the YouCam API hackathon it gained one more step before you buy something: try the piece on yourself with YouCam AI Clothes, then see how many similar pieces you already have and which outfits it would make with your closet.

- Live (contest version, English): https://pairthis-youcam.vercel.app
- Built for the YouCam API Skin AI & eCommerce VTO Hackathon, eCommerce VTO track
- The original Chinese app runs at https://pairthis.app; its readme is in [README.zh-TW.md](README.zh-TW.md)

## What it does

- **Your own closet, without an account.** Paste a product link or take a photo of a piece. The background is removed on your device and everything stays in your browser.
- **One outfit for today's weather, with the reasons.** It picks from your closet for the weather in your city and writes why, for example “Feels like 34°, go for breathable pieces” or “Only “Navy hooded windbreaker” has color; the muted pieces set it off”.
- **Try it on you (YouCam AI Clothes).** On a top's or jacket's page, add a chest-up photo of yourself and tap “Try this on”. The result appears at the top of the item page. In two test runs it was ready in under 20 seconds.
- **Before you buy.** In a store, “In a store?” lets you photograph the piece you're holding. It shows how many similar pieces you already own, the outfits it would make with what you have, and lets you try it on. Wishlist pieces get the same check.

## How the YouCam integration works

| Step | Where | What happens |
|---|---|---|
| Your photo | `src/tryon.js` `preparePhoto` | Scaled to a 1280 px long side, JPEG, rejected below 512×384 (YouCam's minimum). Stored in IndexedDB on the device. |
| The garment | `src/tryon.js` `prepareGarment` | The transparent cutout is placed on a white 960×1280 canvas at 86 % and saved as JPEG, since YouCam takes JPG/PNG product shots. |
| Start | `functions/tryon.mjs` → `functions/_tryon-core.mjs` `startTryOn` | The server uploads both images (`POST /s2s/v2.0/file`, then a PUT to the returned URL), then starts `POST /s2s/v2.0/task/cloth-v4` with `garment_category` `upper_body` (tops) or `outer` (outerwear). |
| Wait | `checkTryOn` | The page polls every few seconds. The server answers only to a ticket it signed (`task.expiry.HMAC`), so a bare YouCam task id can't fetch someone else's photo. |
| Result | `checkTryOn` | The server downloads the result and returns it as a data URL; the page saves it in IndexedDB. Nothing is stored on our server. |

- The API key is a server environment variable (`YOUCAM_API_KEY`); it never reaches the browser.
- Limits so one visitor can't use up the units: 4 starts per minute and 100 per day per IP address, 300 per day per server instance. The counts live in memory on each server instance, so they're a brake, not an exact quota. A try-on uses 2 YouCam units (measured).
- YouCam error codes (pose not found, more than one person, file too small, and so on) are turned into one plain sentence each in `src/tryon.js`.
- Only tops and outerwear are offered. For bottoms and shoes YouCam needs a reference photo of the piece being worn, and closet photos are flat lays.

## Try it (for judges)

1. Open https://pairthis-youcam.vercel.app and tap **See a demo outfit**. The demo closet has 20 pieces.
2. Go to **Closet**, open a top such as *Navy ribbed knit crew-neck sweater*, and under **Try it on you** tap **Take or choose a photo**. Use a chest-up photo, facing the camera, with your shoulders and whole face in view and only you in it. Then tap **Try this on**.
3. Tap **In a store?**, take or choose a photo of a garment, crop it, choose **Tops** or **Outerwear**, and look at the similar pieces and outfits. **Try this on** works there too.
4. Your photo is sent to YouCam only when you tap **Try this on**. Try-on allows 100 a day from one internet connection, shared by everyone on that network.
5. The weather list has cities in Taiwan, where the app was built. Product links were tested with GU's and UNIQLO's Taiwan sites; for other sites, use a screenshot.

## Run it locally

```bash
npm install
echo YOUCAM_API_KEY=your_key > .env.local
npm run dev
```

Open http://localhost:5173/?edit=off for the visitor view (the same one the live site shows). The dev server serves the demo closet from `data/` and the try-on API from `scripts/tryon-api.mjs`, which uses the same core as the deployed function.

To deploy: `npx vite build && node tools/export-static.mjs` writes `contest-site/`; deploy that folder to Vercel and set `YOUCAM_API_KEY` as an environment variable.

## What changed during the hackathon

The app existed before the submission period, which started on 2026-09-29. Only 23 commits in this repository predate that date; the rest, over 100, came after it, including:

- 10-01 onward: wishlist and dream pieces; anyone can build their own closet in their browser; outfit reasons; prices; trash; search
- 10-10: “Compare in store”
- 10-19: the dress form redrawn to real body proportions
- 10-25: **YouCam AI Clothes try-on** on item pages and in “In a store?”, with signed tickets and rate limits
- 10-26: this English version. The occasion box from the Chinese version (“for class, no jacket”) is hidden here because its parser only understands Chinese.

## Privacy

No account, no cookies, no ads, no usage stats in this contest version. Weather comes from Open-Meteo; background removal runs on your device; the try-on photo goes to YouCam only when you ask for it. Details are in [public/privacy.html](public/privacy.html).

## License

MIT ([LICENSE](LICENSE)): the original [Open Wardrobe](https://github.com/tandpfun/wardrobe) code, which is MIT licensed, plus the PairThis changes.

## Third-party licenses

| Component | License | Where it's used |
|---|---|---|
| [@imgly/background-removal](https://github.com/imgly/background-removal-js) | **AGPL-3.0** ([license](https://github.com/imgly/background-removal-js/blob/main/LICENSE.md)) | In the browser, to remove backgrounds on your device |
| @imgly/background-removal-node | AGPL-3.0 (same [license](https://github.com/imgly/background-removal-js/blob/main/LICENSE.md)) | Only in the offline scripts under `tools/`, not on the site |
| [Open Wardrobe](https://github.com/tandpfun/wardrobe) | MIT | The project this one was forked from |
| Cormorant, Noto Serif TC | SIL Open Font License 1.1 | Fonts |
| [Open-Meteo](https://open-meteo.com/) weather data | CC BY 4.0 | Weather for today's pick |
| YouCam AI Clothes API | Perfect Corp. API terms | The try-on, called from the server |

The site sends @imgly/background-removal to the browser. AGPL-3.0 asks that people who use the site can get its full source code; this public repository is that source.
