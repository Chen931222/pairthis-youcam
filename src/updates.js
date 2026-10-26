// [本 fork 新增] 更新公告(2026-10-08 本人要「公告更新的地方」)。
// 每一則都對應已經上線的 commit,日期照 git 紀錄;沒上線的不寫。新的放最前面。
// 加新的一則,入口的「更新」旁邊就會亮一個小點,打開看過就熄。
// 2026-10-24 整份重編:一天一則,只寫用的人感覺得到的改變和要知道的限制。怎麼做的、文字改過幾次、誰說了什麼,
// 寫在 git 和 vault 日誌,不寫這裡。影響資料或隱私的更正一定留著。短句、寫數字,不寫「全新體驗」這種話。

// [參賽版修改 2026-10-26] 英文參賽版只列 10-25 那兩則:更早的是中文正式站的歷史,講到這版沒有的東西
// (打一句話、25 秒介紹、回報鈕、使用統計、pairthis.app 網址),跟隱私頁「不記統計」打架(驗收抓到)。原文留在 ALL_UPDATES
const ALL_UPDATES = [
  // [參賽版新增 2026-10-25] 只在 YouCam 黑客松參賽版
  {
    date: "2026-10-25",
    title: "Try it on you (contest version)",
    items: [
      "Item pages for tops and outerwear now have “Try it on you”: add a chest-up, front-facing photo, tap “Try this on”, and the try-on photo appears at the top of the item page (ready in under 20 seconds in two test runs).",
      "Your photo stays on this device. Only when you tap “Try this on” are the photo and the piece's image sent to YouCam (Perfect Corp.) to make the try-on; up to 100 a day from the same internet connection.",
      "Compare in store can try on too: photograph the piece in the store, choose Top or Outerwear, and after the comparison there's “Try this on”.",
      "Bottoms and shoes can't be tried on yet: YouCam needs a reference photo of them being worn, and the closet's photos are flat lays.",
    ],
  },
  {
    date: "2026-10-25",
    title: "Adding your first piece is smoother",
    items: [
      "For an image picked from a product page, just tap “Remove whole background”; crop only if there's a logo or something else in it.",
      "The outfit made after your first piece stays on the form after a reload, borrowed demo pieces included.",
      "The Outfits rack opens on a category that has clothes; the “This piece” options are now I own it, Want it and Dream piece, with “This piece” on its own line.",
      "When your own clothes aren't enough for an outfit, today's pick on the home screen and “Another outfit” borrow the missing pieces from the demo closet, and the reasons say how many were borrowed. It used to end at “Add a top to make an outfit”. Saved outfits with borrowed pieces can be worn again too.",
      "“Fill in” after background removal only shows up for light-colored pieces.",
    ],
  },
  {
    date: "2026-10-24",
    title: "The demo goes straight to Outfits; privacy notes corrected",
    items: [
      "“See a demo outfit” now goes straight to the Outfits page, with the form wearing the home screen's outfit. Above the form is one line, “Try: for class, no jacket”; tap it and it re-picks with that line (demo closet only).",
      "When you say “no jacket”, the reasons now say honestly why a jacket would have been added: because it's cold, or because of rain.",
      "Scrolling down the home screen shows a three-step demo: two screen recordings and a before-and-after for one typed line; at the bottom is a 25-second intro (with sound, downloaded only when you tap it). Feedback is at the very bottom of the home screen.",
      "New logo. If you already added it to your Home Screen, delete the icon and add it again to see the new one.",
      "Two reminders added: the form shows flat-lay photos, so the drape will look different when worn; the first background removal downloads an 80 MB model.",
      "Correction: it used to say “photos never leave your phone” and “with sync on, the cloud only keeps an encrypted copy”. Sync is used only by the site owner's own devices and visitors can't turn it on, so both sentences claimed more than was true. They're gone.",
      "Correction: when you paste a GU or UNIQLO link, your browser downloads the product images straight from the brand, so the brand can see your IP address. It used to say the brand only saw this site's server.",
      "The privacy notes are split into clearer sections; the usage stats list now includes a recommendation type that was missing (the outfit made after your first piece).",
    ],
  },
  {
    date: "2026-10-23",
    title: "The address is now pairthis.app",
    items: [
      "New address pairthis.app, and the site is now called PairThis (搭這件 in Chinese). The old address wardrobe-gallery.vercel.app still works, but closets saved there don't move over by themselves; use a backup file to move them.",
      "While your closet is empty, pasting a product link defaults to “I own it”, and saving it makes your first outfit right away.",
      "The demo form on the home screen now shows the reasons for its outfit.",
    ],
  },
  {
    date: "2026-10-22",
    title: "Retake a photo, see a piece from the form, search “all black”",
    items: [
      "After the background is removed from your own photo, you can tap “Retake”; the name and category you filled in stay.",
      "Tap a piece on the Outfits form and there's a new “See this piece's details” button.",
      "Searching “全黑”, “黑色” or “黑的” all count as “black” (the Chinese search words). Color only matches words in the name, so pieces without a color in the name won't show up.",
    ],
  },
  {
    date: "2026-10-21",
    title: "Your first piece is easier to add",
    items: [
      "You can skip the category when adding; it guesses from the name and shape, and the closet tile says “Category guessed”. If it's wrong, open the piece and change it.",
      "After your first piece, it immediately pairs it with demo closet clothes to give you an outfit.",
      "New “Stuck somewhere? Tell me”: write one sentence and send it.",
      "Fixed Safari private tabs on iPad and iPhone not saving clothes. Clothes added in a private tab disappear when the tab closes.",
      "Usage stats record a few more actions, never the content of your clothes; the privacy notes list them.",
    ],
  },
  {
    date: "2026-10-20",
    title: "On a computer, scrolling through clothes no longer cuts off the form",
    items: [
      "On a computer, the form on the Outfits page follows you as you scroll; weather and reasons moved above the rack on the right.",
      "Zooming a piece with the scroll wheel no longer scrolls the page.",
      "Names with “casual” (休閒) count as leaning casual.",
    ],
  },
  {
    date: "2026-10-19",
    title: "The form is redrawn with the right proportions",
    items: [
      "The form is redrawn to real body proportions. Clothes are placed by sizes measured from their photos: tops hang from the shoulders, pants sit at the waist, shoes stand on the floor.",
      "Pieces you moved yourself stay put; tap the piece and “Reset this piece” to use the new position.",
      "Long pants stop above the shoes, bags with straps stay inside the form, and the ✕ on the form avoids other pieces.",
      "Recommendation reasons talk only about the outfit; how each piece was judged is tucked into “How it decided”.",
    ],
  },
  {
    date: "2026-10-18",
    title: "“For class, no jacket” now works",
    items: [
      "You can name an occasion and what you don't want together: “for class, no jacket” picks a whole outfit for class without a jacket.",
      "“Heard” at the top lists which conditions the outfit followed, and any part it didn't understand is quoted back.",
    ],
  },
  {
    date: "2026-10-10",
    title: "Compare in store",
    items: [
      "A new “Compare in store” button above the closet: photograph the piece you're looking at and see how many similar-colored ones you own and which outfits it would make. No need to save it.",
      "The first time, it downloads an 80 MB background-removal model; open it once on Wi-Fi at home first.",
    ],
  },
  {
    date: "2026-10-09",
    title: "Usage stats, Dream pieces, privacy notes",
    items: [
      "Anonymous usage stats started (Umami, no cookies), never recording clothes' names, photos or anything you type. To opt out, open the site once with ?notrack at the end of the address. Details are in “Privacy and how it works”.",
      "“Dreams” is renamed “Dream pieces”, and you can move several wishlist pieces there at once.",
      "Each piece on the form has an ✕ at the top right to take it off; tap a piece to bring it forward or send it backward.",
    ],
  },
  {
    date: "2026-10-08",
    title: "Light theme, search, notes",
    items: [
      "The background is now a light wood tone.",
      "The closet has search; separate words with spaces to combine them, like “black shorts”.",
      "Item pages have a note field that only you can see.",
      "On the Outfits page, a shirt can be layered over a T-shirt.",
      "This updates list is new.",
    ],
  },
  {
    date: "2026-10-07",
    title: "Brands and totals",
    items: [
      "The closet index has a row of brands, and you can edit the brand on the item page.",
      "Below the index is a total price, counting only priced pieces; different currencies are added separately, not converted.",
      "White clothes lose fewer bits in background removal; if a bit is still missing, tap “Fill in”.",
    ],
  },
  {
    date: "2026-10-06",
    title: "Trash, and accessories in outfits",
    items: [
      "Deleted pieces go to the trash first and are deleted for good after 30 days.",
      "Today's pick now adds accessories like watches and glasses, and takes the outfits you chose before into account.",
      "Two of the same piece merge into one tile with a quantity. You can change a piece's image on its item page.",
      "Fixed images sometimes not showing on iPhone.",
    ],
  },
  {
    date: "2026-10-05",
    title: "Prices and a first-visit screen",
    items: [
      "Clothes can have a price.",
      "First visits open on a demo outfit, and you can choose the city for the weather.",
      "Opening it in the LINE or Instagram in-app browser shows a warning first; every 3 new pieces it reminds you to back up.",
    ],
  },
  {
    date: "2026-10-04",
    title: "Links from other brands work too",
    items: [
      "Brands other than GU and UNIQLO can be pasted as links to pick images. Sites like Shopee and Zara can't be read, so use a screenshot.",
      "Backups are now one ZIP file that includes the cutout images.",
    ],
  },
  {
    date: "2026-10-03",
    title: "Phone links, recommendation reasons",
    items: [
      "GU and UNIQLO links on phones, and the whole text the GU app shares, can be pasted in.",
      "Saying “interview” no longer gets you shorts.",
    ],
  },
  {
    date: "2026-10-02",
    title: "Your own closet",
    items: [
      "Anyone can add their own clothes, saved in their own browser where nobody else can see them.",
      "Your closet and the demo closet are separate, and recommendations only pair within one closet.",
      "Before saving, it warns about duplicates: the same link pasted twice, or a piece of the same style and color already in the closet.",
    ],
  },
  {
    date: "2026-10-01",
    title: "Wishlist clothes",
    items: [
      "Clothes you haven't bought can go in the closet too, by pasting a GU or UNIQLO product link and picking an image.",
      "A wishlist piece lists similar pieces you own, then makes three outfits with clothes you already have.",
    ],
  },
];

const SEEN_KEY = "open-wardrobe-updates-seen-v1";

// 看過的標記 = 最新一則的日期＋標題＋條數。2026-10-24 起一天一則,同一天再上線是往那則加條目、標題不一定換,
// 所以要帶條數才會再亮。(以前只用「日期＋條數」:一天好幾則時,條數一樣的兩則分不出來,驗收抓到過)
const latestMark = () => `${UPDATES[0].date}#${UPDATES[0].title}#${UPDATES[0].items.length}`;

/** 有沒有還沒看過的公告;讀不到儲存(無痕、被擋)就當看過,不要一直亮點 */
export function hasUnseenUpdates() {
  try {
    return (localStorage.getItem(SEEN_KEY) || "") !== latestMark();
  } catch {
    return false;
  }
}

export function markUpdatesSeen() {
  try { localStorage.setItem(SEEN_KEY, latestMark()); } catch { /* 存不了就算了,下次再亮一次 */ }
}

export const UPDATES = ALL_UPDATES.filter((entry) => entry.date >= "2026-10-25");

/** 2026-10-08 → 10.08 */
export const shortDate = (date) => date.slice(5).replace("-", ".");
