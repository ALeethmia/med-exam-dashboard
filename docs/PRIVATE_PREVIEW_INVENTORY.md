# 私人預覽與歷史內容盤點

盤點日期：2026-10-15。**只盤點及提出保存建議，本輪沒有刪除、修改、重新發布或更改任何存取設定。**

## 來源與驗證範圍

已知 Becoming 私人站：[becoming-a1-art-review.abuzzowl.chatgpt.site](https://becoming-a1-art-review.abuzzowl.chatgpt.site/)。提供者為 OpenAI Sites；API 回報專案 active、受限存取（custom），目前使用者為 owner。本輪未修改權限，也不將受限存取誤稱公開。

- 專案 ID：`appgprj_6ace314a9b2c819180d7be5af5e9c0e7`。
- API 確認目前成功發布的版本為 22，展示來源 Commit：`23100bcd486986df36f1c0d47193f80d04baa4b3`。
- 來源是獨立私人 Sites 展示 Repository 的 `dist/`，不是正式 `ALeethmia/med-exam-dashboard` main。此本機來源與上述版本相符。
- 透過受限站台的合法讀取權限取得下列 11 個 HTML 入口及 Growth I1 ZIP；均 HTTP 200，回應 SHA256 與相符來源檔一致。部分 `.html` 入口先 307 至同站無副檔名／目錄網址，跟隨後才取得內容；未將 307 當成內容已驗證。
- 本輪只核對入口與指定 ZIP，未逐一測試所有按鈕、圖片、內嵌資源或所有其他 ZIP，也沒有執行歷史頁面的資料操作。
- 清單只涵蓋目前可追溯的 Becoming 站與來源；其他未提供網址／不在來源中的內部展示，均為「無法驗證」，不能據此斷定已刪除或仍存在。

## 分類清單

類別：A＝仍有保存價值；B＝已被正式版取代的預覽；C＝方向已淘汰、未來可評估刪除；D＝用途或現況尚未充分確認。分類是建議，不是刪除授權。

| 內容與已知網址 | 用途／來源 | 本輪狀態 | 分類與保存建議／待確認 |
| --- | --- | --- | --- |
| [首頁／A1 簡化美術展示](https://becoming-a1-art-review.abuzzowl.chatgpt.site/) | `dist/index.html`、`images/`；A1 第二輪高精度概念，兼有歷史導航 | HTML 200；仍以 I3 標為「目前驗收」，沒有 Growth I1 入口連結 | C（圖像方向）／B（導航）；保留設計決策摘要與來源。未來另行核准是否更新歷史標示／導航；不可當正式版入口 |
| [A1 第一輪](https://becoming-a1-art-review.abuzzowl.chatgpt.site/original.html) | `dist/original.html`、原始高精度概念 | HTML 200 | C；未被採用，確認離線備份與來源紀錄後，才評估刪除大型展示副本 |
| [A1.1](https://becoming-a1-art-review.abuzzowl.chatgpt.site/a11.html) | `dist/a11.html`、`a11/`；局部美術修正與比較 | HTML 200；圖片未逐檔核對 | A（決策／來源紀錄）＋C（高精度圖片）；概念核准不等於正式素材。保存權利與技術限制摘要 |
| [A2](https://becoming-a1-art-review.abuzzowl.chatgpt.site/a2.html) | `dist/a2.html`、`a2/`；學院分層／透明度技術展示 | HTML 200，約 15.4 MB；未重做互動／效能驗收 | C；分層高精度方向已放棄。保留可重用技術結論，未來可評估大檔及下載副本 |
| [早期 Lite](https://becoming-a1-art-review.abuzzowl.chatgpt.site/lite/) | `dist/lite/`；早期 Lite／v2 互動迭代 | HTML 200 | B；由 v2.1／正式版取代。保留最小風格轉向紀錄，確認是否仍需完整早期包 |
| [Lite v2.1](https://becoming-a1-art-review.abuzzowl.chatgpt.site/lite-v21/) | `dist/lite-v21/`；手機 120% 視角、預設收合圖鑑 | HTML 200 | A＋B；保留已驗收手機比例與圖鑑互動基準，不當真實進度來源 |
| [Lite I1](https://becoming-a1-art-review.abuzzowl.chatgpt.site/lite-i1/kingdom-preview.html) | `dist/lite-i1/`；既有地圖架構與 Lite 合體 | HTML 200 | A＋B；保留世界座標、穩定建築 ID、相機與 SVG 沿用證據，正式版已取代此操作入口 |
| [Lite I2a／I2a.1](https://becoming-a1-art-review.abuzzowl.chatgpt.site/lite-i2a/?v=i2a1) | `dist/lite-i2a/`；Dashboard 布局、多建築、懸浮分頁及捲動修補 | 目錄入口 HTML 200；查詢參數不代表獨立版本 | A＋B；保存核准布局與 Mac 滾動決策。未將本輪入口檢查誤稱實體 Mac 驗收 |
| [Lite I2b](https://becoming-a1-art-review.abuzzowl.chatgpt.site/lite-i2b/) | `dist/lite-i2b/`；去識別化 Fixtures／唯讀映射 | HTML 200 | A＋B；保留資料映射、未知狀態與預覽分離契約；不代表正式 Firebase 讀寫驗收 |
| [Lite I3](https://becoming-a1-art-review.abuzzowl.chatgpt.site/lite-i3/?v=task-sync) | `dist/lite-i3/`；載入情境與 Task Sync 歷史候選 | 目錄入口 HTML 200 | B；舊同步方案不作目前產品規格。保留 UID／首次載入安全測試概念，勿重新帶入已淘汰架構 |
| [Growth I1](https://becoming-a1-art-review.abuzzowl.chatgpt.site/growth-i1/index.html) | `dist/growth-i1/`；已核准的成長／Design A／Lite Fixtures 基準 | HTML 200；非正式帳號資料 | A＋B；優先保留人工驗收依據、可重現 Fixtures 與核准包，正式 main 才是現況權威 |

## ZIP、內部展示與共用資源

- [Growth I1 完整 ZIP](https://becoming-a1-art-review.abuzzowl.chatgpt.site/downloads/becoming-growth-i1-review.zip)：實際 HTTP 200／application/zip，2,400,101 bytes；SHA256 `c87da08bcd499fc1c5be92ae35c8a8b85d8165ad65dd83cdbf171b36ac2b63af` 與已核准值一致。建議優先保留。這不是 PR #18 現行正式源碼包。
- A1 ZIP、Lite 各階段包及 `dist/downloads/becoming-phase2b2b-lite-i32-consistency-review.zip`：本機版本 22 來源存在；本輪未逐包 HTTP／解壓驗證，因此下載完整性標示「無法驗證」。I3.2 包僅可作一致性風險／測試歷史，可信交易服務已淘汰，不列為待整合產品。
- `dist/review/comparison.html`、`review/thumbnails.html`、截圖、`a11/` 稽核 JSON、`a2/reports/`：來源存在，屬內部比較／驗收素材；每項即時頁面及目前用途「無法驗證」，分類 D。先確認是否有唯一證據再決定保留或刪除，不猜測獨立網站 URL。
- `dist/images/`、各階段共用 JS／CSS／圖片／下載：可能同時被多頁引用，不能因某頁列為 C 就刪整個資料夾。需先逐項檢查引用及備份，另輪授權。

## 正式封存與未來清理前提

正式 Repository 已於 PR #16 移除未使用高精度圖片的工作樹副本；這不代表私人站的檔案已刪除，也不代表 Git 歷史被清除。仍保留 [A1 歷史摘要](art/phase-2b2b/a1/README.md)、[來源／權利限制](art/phase-2b2b/a1/SOURCE_AND_LIMITATIONS.md) 與資產 hash 清單。圖像來自內建生成流程，現有來源紀錄不是新授權證明，未完成的商用權利審查不能改稱已完成。

未來若清理，須另行確認：保留哪些唯一設計成果／ZIP、是否有可還原的離線備份、哪些共用資源仍被引用，以及哪些內容需繼續受限存取。先定保存清單，再提出精確刪除路徑與容量；不動正式 Lite 美術、正式網站或使用者資料。本輪沒有執行任何清理。
