// [本 fork 新增] 衣服的分類(部位)只有這一份:衣櫃的目錄、新增的選單、搭配頁的衣架、入口圓環都從這裡讀。
//
// 2026-10-06 本人要加皮帶、戒指、項鍊、鋼筆。舊版分類清單散在五六個檔案,各寫一份,加一類要改每一處,
// 漏一處那一類的衣服就在那裡看不到。分組照衣櫃目錄的樣子:衣服、鞋襪、配件、隨身小物。
// 「隨身小物」(鋼筆、皮夾、打火機)不是穿在身上的,推薦不會自動配;手動穿上時人台把它畫在胸前口袋。
export const PART_GROUPS = [
  { id: "clothes", label: "Clothes", parts: ["upperbody", "wholebody_up", "lowerbody"] },
  { id: "feet", label: "Footwear", parts: ["shoes", "socks"] },
  { id: "accessories", label: "Accessories", parts: ["bag", "eyewear", "wrist", "belt", "necklace", "ring", "accessories_up"] },
  { id: "carry", label: "Carry", parts: ["carry"] },
];

/** 完整名稱(選單、衣架);short 是衣櫃目錄裡放在「配件」那一行時的短名 */
export const PARTS = {
  upperbody: { label: "Tops", singular: "Top" },
  wholebody_up: { label: "Outerwear", singular: "Outerwear" },
  lowerbody: { label: "Bottoms", singular: "Bottoms" },
  shoes: { label: "Shoes", singular: "Shoes" },
  socks: { label: "Socks", singular: "Socks" },
  bag: { label: "Bags", singular: "Bag" },
  eyewear: { label: "Eyewear", singular: "Eyewear" },
  wrist: { label: "Watches & bracelets", singular: "Wristwear", short: "Watches" },
  belt: { label: "Belts", singular: "Belt" },
  necklace: { label: "Necklaces", singular: "Necklace" },
  ring: { label: "Rings", singular: "Ring" },
  accessories_up: { label: "Other accessories", singular: "Accessory", short: "Other" },
  carry: { label: "Everyday carry", singular: "Small item", short: "Carry", hint: "Pen, wallet, lighter" },
};

export const PART_ORDER = PART_GROUPS.flatMap((group) => group.parts);
export const partLabel = (part) => PARTS[part]?.label || "Piece";
export const partSingular = (part) => PARTS[part]?.singular || "Item";
