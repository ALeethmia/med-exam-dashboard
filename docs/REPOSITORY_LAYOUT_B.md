> 歷史紀錄：本文件描述 PR #17。現行分類及舊 URL 處理請見 [第二輪分類](REPOSITORY_LAYOUT_FINAL.md)。

# Repository B：分類整理審查

基準 main：`d3e35b5d088db4b15a9d73646a720cee794dc6b6`。本輪只有分類搬移、必要路徑及測試／文件更新；不重構函式、API、資料流或 UI，不合併或部署 Production。

## 安全範圍與目錄

盤點全部 58 個根目錄 JS／CSS／JSON／HTML／CJS（46 JS、5 CSS、4 JSON、2 HTML、1 CJS）及 66 份含模組引用的來源／測試檔案。完整根目錄對照、原始 SHA256、保留理由與 HTML 順序見 [REPOSITORY_LAYOUT_B_MAP.json](REPOSITORY_LAYOUT_B_MAP.json)。

原先 14 個無全域初始化副作用的模組位於根目錄；現在使用 `git mv` 移至：

```text
src/
  study/    study-core.js, growth-core.js, life-core.js
  planner/  adaptive-core.js, task-projection.js
  kingdom/  chapters.js, territory-core.js, kingdom-core.js,
            kingdom-lite-art.js, kingdom-building-manifest.js,
            kingdom-map-core.js, kingdom-preview-state.js,
            realm-growth.js, readonly-mapping.js
styles/     tailwind.css（原位置不變）
public/     原建置輸出與公開資源（不變）
tests/      既有測試、Fixtures、Mock（不搬移）
scripts/    既有工具（不搬移）
```

根目錄原檔名保留單行 `export * from './src/…'` 相容入口，不是另一份實作，不更名、不拆分 API。原有 JS URL、匯出及函式／常數實例保持一致；CSS、HTML、快取設定和所有既有入口原位保留。因此本輪不以減少根目錄檔名數量為目標，也不建立空的 src/auth、src/sync、src/workspace、src/ui。

## 原路徑 → 實作新路徑

| 原路徑／保留的 URL | 新實作 |
| --- | --- |
| `adaptive-core.js` | `src/planner/adaptive-core.js` |
| `chapters.js` | `src/kingdom/chapters.js` |
| `growth-core.js` | `src/study/growth-core.js` |
| `kingdom-building-manifest.js` | `src/kingdom/kingdom-building-manifest.js` |
| `kingdom-core.js` | `src/kingdom/kingdom-core.js` |
| `kingdom-lite-art.js` | `src/kingdom/kingdom-lite-art.js` |
| `kingdom-map-core.js` | `src/kingdom/kingdom-map-core.js` |
| `kingdom-preview-state.js` | `src/kingdom/kingdom-preview-state.js` |
| `life-core.js` | `src/study/life-core.js` |
| `readonly-mapping.js` | `src/kingdom/readonly-mapping.js` |
| `realm-growth.js` | `src/kingdom/realm-growth.js` |
| `study-core.js` | `src/study/study-core.js` |
| `task-projection.js` | `src/planner/task-projection.js` |
| `territory-core.js` | `src/kingdom/territory-core.js` |

## 未移動的檔案與原因

完整 44 檔清單及逐檔理由在對照 JSON 中；類別如下：

- `theme.js`、`subjects.js`、`sync.js`、`firebase-config.js`：Classic Script 全域與順序契約。
- `firebase-entry.js`、`auth.js`、`workspace.js`、`account-storage.js`、`readiness.js`、`i3-runtime.js`：UID 綁定、首次載入及登入後動態初始化；原始位元組不變。
- `daily-planner.js`、`course-dates.js`、`time-tasks.js`、`life-store.js`、`adaptive-store.js`、`legacy-rewards.js`：既有資料／pending／歷史獎勵生命週期；原始位元組不變。
- DOM UI、地圖 renderer／input 與預覽入口保留，避免擴大互動初始化搬移範圍。
- 五份根目錄 CSS 保留：`workspace.css`、`kingdom.css`、`i2a-kingdom.css`、`i3.css`、`kingdom-map.css`，不新增 @import 包裝或調整樣式層疊。
- `index.html`、`kingdom-preview.html`、`server.js`、`package.json`、`package-lock.json`、`vercel.json`、`playwright.config.js`、`tailwind.config.cjs`、`metadata.json` 保留原位與內容。metadata 是主機描述；不順便清除或修改其歷史欄位。
- `vercel.json` 的已刪除 codex 分支停用項目已檢查；不影響本輪分類，依授權不修改無關設定。

## 依賴與必要工具調整

- HTML：所有 script／stylesheet 標籤、順序、Classic／Module 類型及 inline bootstrap 原樣保留。
- 初始化鏈：theme／vendors → subjects／原 inline shell → firebase-config → firebase-entry → auth → 動態載入 sync、原 learning-script、workspace；沒有新增初始化入口。
- ESM：只更新搬移檔案中的相對 import。未搬移的程式與既有測試可繼續使用原 URL，re-export 與 canonical 路徑共用相同實作實例。
- Node／Express／Vercel：server 靜態根目錄、路由 fallback、Cache-Control／Pragma／Expires、etag／lastModified 選項不變，沒有新增 rewrite 或 redirect。
- 建置：public 輸出不變。lint 補查 src 下的真實實作；Fixtures 展示建置補複製 src 目錄，以維持既有子目錄部署與 CSP／離線契約。
- 測試：原 kingdom 純度檢查改讀真實搬移來源，沒有讓檢查只讀 re-export 而失去意義；新增六項路徑／內容／載入順序回歸，納入原 npm test glob，未變更套件或 CI 流程。
- 文件：舊 .js 連結仍指向有效相容入口，另在 README 提供 canonical 結構與完整對照。

## 實際驗證

- `npm ci`、`npm run build`、`npm run lint` 通過；`npm test`：199 項通過（原 193 + 新增 6）。
- 既有必要 Playwright 子集：5 項通過（390／1440px）。
- canonical auth／Store bridge：6 項；Fixtures 頁面：72 項（1440／390／320）；失敗／pending／批次：12 項（三尺寸）；讀書功能：14 項。合計 109 項瀏覽器／整合檢查通過。
- 1440／390／320px 獨立 Smoke：18 項通過；涵蓋 Mock 未登入入口、本機 RAM Dashboard、課程與日期、任務、Lite 地圖與同步介面。沒有真實資料庫請求、頁面 JS 錯誤或本機資源錯誤。
- HTTP 資源：14 個舊 URL + 14 個 canonical URL + 5 CSS，共 33 個，全部 200、正確 MIME／內容；原 no-store／no-cache、Pragma、Expires 與無 ETag／Last-Modified 行為保持。
- 六項新增回歸驗證全部根目錄覆蓋、44 個保留檔案位元組、14 個搬移實作僅 import 路徑差異、舊新匯出鍵及參照 identity 相同、全部相對 ESM／dynamic import／re-export 可解析、HTML 順序與資源路徑保持。
- GitHub CI 以本 Draft PR 的實際 Head 為準，結果記錄於 PR。本輪不宣稱跑完所有歷史 legacy 視覺測試；採用現行 CI 指定的既有瀏覽器／整合套件，且額外覆蓋 320px。

## 風險與審查邊界

- 原 URL 會多一次 re-export 解析／請求；沒有複製實作或新全域狀態，舊新入口共用同一模組。本輪不做打包或載入效能重構，未對極慢實體網路作測量。
- 新 src 目錄必須隨程式部署；已修正既有 Fixtures 打包路徑並驗證子目錄靜態展示，不能只單獨複製根目錄 .js。
- 內容 hash 回歸是本輪「只搬路徑、不改邏輯」的審查基準；未來若獲授權修改邏輯，須同步審查／更新對照基準，不代表正式 API 被永久凍結。
- 瀏覽器測試為 Chromium 模擬／Mock，不是實體手機、真實帳號或 Production Firebase 端到端測試。未修改 Firebase／Rules／Schema、任何真實紀錄、XP、pending 或 Production。
- 保持 Draft，等待人工 Code Review；本輪不 Merge、不部署 Production、不啟動 C 方案。
