# 最終 Repository Cleanup 審查

基準 main：`5ca7275291611c8a74b8b9d9befbb76d21b1312f`。僅修改 `docs/`；本輪只建立 Draft PR，不合併、不刪分支、不部署、不動 Firebase 或私人 `.site`。

## 檔案清理

- 移除 A1／A1.1 的 17 張未採用概念圖、草稿與歷史驗收圖：45,895,205 bytes。
- 移除 `docs/screenshots/` 中 15 張無引用舊截圖：2,460,515 bytes。
- 合計移除 32 張 PNG，48,355,720 bytes（約 46.12 MiB）。未發現完全相同 SHA256 的重複 PNG；不將不同截圖誤稱為逐位元重複。
- 保留 A1 來源與權利限制、歷史驗收、A2 技術限制及 `records/` 原始紀錄。更新 A1 README 與 Manifest，明示舊圖只在 Git 歷史，不留下失效的當前圖片連結。
- A1 每個資產的容量與 SHA256 可由 `docs/art/phase-2b2b/a1/ASSET_MANIFEST.json` 核對；`archive_url` 指向上述固定 Commit。沒有改寫或縮減 Git 歷史；本次減量只適用目前工作樹／來源封裝。
- 保留 README 引用的 6 張截圖，以及 `tests/browser/kingdom-map.spec.js` 動態路徑指定的 2 張地圖截圖。沒有刪除測試、舊預覽路由或必要技術文件。
- Production Lite SVG、美術模組、Dashboard、登入、讀書計畫、成長公式與 pending／XP 同步程式全部與基準逐位元相同。

移除的無引用舊截圖（均可從固定 Commit 的 `docs/screenshots/` 取回）：

| 檔名 | bytes |
| --- | ---: |
| `adaptive-preview-desktop.png` | 67,286 |
| `adaptive-recently-removed-mobile.png` | 95,333 |
| `adaptive-week-mobile.png` | 106,264 |
| `becoming-week-trend-desktop.png` | 116,625 |
| `biochem-schedule-mobile.png` | 37,959 |
| `buildings-comparison-desktop.png` | 405,362 |
| `buildings-comparison-mobile.png` | 304,670 |
| `character-story-desktop.png` | 89,359 |
| `character-story-mobile.png` | 69,535 |
| `chronicles-collection-desktop.png` | 86,355 |
| `chronicles-collection-mobile.png` | 62,855 |
| `rpg-ux-desktop.png` | 429,513 |
| `rpg-ux-mobile.png` | 304,344 |
| `territory-growth-desktop.png` | 165,457 |
| `territory-growth-mobile.png` | 119,598 |

## 分支盤點與建議名單

盤點時 main 之外共有 9 個遠端分支；以下 8 個列為刪除候選，這是供下次授權審查的名單，並未刪除。沒有開啟中的原功能 PR 或未合併內容。Cleanup 分支本身需保留至本 PR 最終處理。

| 分支 | main 未包含的 Commit 數 | 已合併 PR | Vercel 依賴判讀 |
| --- | ---: | --- | --- |
| `codex/growth-i1-integration` | 0 | #13 | 無查到部署；`vercel.json` 僅保留此分支的停用規則（不是活躍部署依賴），設定原樣保留。 |
| `docs/becoming-phase2b2b-a1-art-baseline` | 1（patch 等價） | #12 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |
| `feature/becoming-phase2b1` | 0 | #9 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |
| `feature/becoming-phase2b1a-rpg-ux` | 0 | #10 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |
| `feature/becoming-phase2b2a-map-preview` | 0 | #11 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |
| `feature/subject-workspace` | 0 | #2 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |
| `fix/course-snapshot-arrays` | 0 | #14 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |
| `fix/pending-readiness-retry` | 0 | #15 | 有歷史 Preview；無 Production／網域／環境變數／Hook 綁定。刪除前確認舊 Preview 網址不再使用。 |

`docs/becoming-phase2b2b-a1-art-baseline` 的原 Commit `12f74f6` 不在 main 祖先鏈，但 `git cherry origin/main <branch>` 顯示 `-`（patch 已存在）；PR #12 已 squash 合併為 `26786ef`，且其整個 A1 目錄與清理前 main 沒有差異。它沒有獨有未完成內容，但若要保留原 Commit 身分，刪除前另行決定保留方式；本輪不建立 Tag。

**保留 staging**：`ed724c9d57db93231cbacee5e9043af78e849e15`，0 個獨有 Commit，main 領先 10 個 Commit。使用者要求暫留，不自動刪除或更新。main 永不列入刪除清單。

## Vercel 唯讀核對

- 專案：`med-exam-dashboard` / `prj_GpatjsrrObLmUUXmocuJTvPpfINU`。
- Production 分支 main，正式部署 `dpl_8tWjziN263PRGUUFGFZh8poR46ba`、Source SHA 同基準 main，READY。
- 唯一專案網域 `med-exam-dashboard.vercel.app` 沒有分支／自訂環境綁定。
- 無自訂環境、無環境變數項目（因此無 branch override），無 deploy hook；未輸出任何秘密值。
- 7 個歷史 Preview 的分支來源：除 codex 分支外的 7 個刪除候選。另有 staging Preview，照使用者要求保留。
- 舊 Preview 是否仍被人工書籤、分享連結或外部流程使用，無法僅憑平台設定判定，須在真正刪除分支前人工確認。本次不刪 Preview、不改別名、不修改 Vercel 設定。

## 驗證

- `npm ci`、`npm run build`、`npm test`、`npm run lint` 通過：193 項單元測試。
- 既有瀏覽器測試 `version.spec.js`／`course-dates.spec.js` 必要子集：5 項通過，涵蓋 390／1440px。
- 資源引用掃描涵蓋 tracked 程式、HTML、樣式、JSON、建置與 CI；移除圖檔沒有運行時引用。地圖測試的動態輸出路徑另行保留。
- A1 Manifest 29 個項目全部以 SHA256／容量核對：17 個歷史圖從固定 Git Commit 讀取，12 個保留文件從目前工作樹讀取。
- 非 docs 檔案的 Git 差異為零，涵蓋所有正式 JS、HTML、CSS、路由、Firebase 設定、建置／測試與 Vercel 設定。
- 全部驗證使用本機示範或 Mock；沒有登入真實帳號或讀寫正式 Firebase。GitHub CI 以此 Draft PR 的實際 Head 為準，結果附在 PR。

## 待人工確認

1. 審查移除的歷史圖片範圍；如仍需當前工作樹保留特定舊圖，可從固定 Commit 復原。
2. 真正刪除分支前，確認 7 個舊 Preview 無人繼續使用，以及 docs squash 分支不需保存原 Commit 身分。
3. 本 PR 不包含遠端分支刪除、Merge、Production 部署或私人展示站清理；這些動作須另外授權。
