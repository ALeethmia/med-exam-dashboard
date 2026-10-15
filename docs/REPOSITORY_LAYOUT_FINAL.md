# Repository B：第二輪分類

基準：main `84c8c1e8cdbd161d54964e8d230973db45ab12d3`。只移檔、改引用與舊 URL 相容，不修改產品函式、Firebase 路徑、公式或資料。

## 目錄與數量

```text
src/study/      # 純計算、學習／生活 UI
src/planner/    # 規劃純計算、任務投影、規劃 UI
src/kingdom/    # 王國計算、Lite 美術、地圖、編年史與 UI
src/ui/         # 版本 UI
styles/         # 所有應用 CSS，含原有 Tailwind 輸入
compat/         # 27 個舊公開 JS URL 的薄轉接；不放產品邏輯
config/         # 舊公開資源 URL 對照
```

- 13 個 UI／地圖 JS、5 個 CSS 以 git mv 移動。
- 14 個原根目錄 re-export 檔不再佔根目錄，改由集中相容入口提供；未刪除其實作。
- 根目錄 JS 46 → 19；CSS 5 → 0。保留四個 JSON，沒有足夠證據認定它們可以刪除。
- 沒有刪除業務功能、歷史資料、測試、Lite 美術或尚無法證明未使用的設定。

## 原路徑 → 新實作

| 原公開路徑 | 新實作／樣式 |
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
| `kingdom-ui.js` | `src/kingdom/kingdom-ui.js` |
| `chronicles-ui.js` | `src/kingdom/chronicles-ui.js` |
| `territory-ui.js` | `src/kingdom/territory-ui.js` |
| `kingdom-map-renderer.js` | `src/kingdom/kingdom-map-renderer.js` |
| `kingdom-map-input.js` | `src/kingdom/kingdom-map-input.js` |
| `kingdom-preview.js` | `src/kingdom/kingdom-preview.js` |
| `i2a-map.js` | `src/kingdom/i2a-map.js` |
| `planner-ui.js` | `src/planner/planner-ui.js` |
| `week-plan-ui.js` | `src/planner/week-plan-ui.js` |
| `adaptive-ui.js` | `src/planner/adaptive-ui.js` |
| `growth-ui.js` | `src/study/growth-ui.js` |
| `life-ui.js` | `src/study/life-ui.js` |
| `version-ui.js` | `src/ui/version-ui.js` |
| `kingdom-map.css` | `styles/kingdom-map.css` |
| `workspace.css` | `styles/workspace.css` |
| `kingdom.css` | `styles/kingdom.css` |
| `i2a-kingdom.css` | `styles/i2a-kingdom.css` |
| `i3.css` | `styles/i3.css` |

## 保留原位

`account-storage.js`, `adaptive-store.js`, `auth.js`, `course-dates.js`, `daily-planner.js`, `firebase-config.js`, `firebase-entry.js`, `i3-runtime.js`, `legacy-rewards.js`, `life-store.js`, `owner-config.js`, `playwright.config.js`, `readiness.js`, `server.js`, `subjects.js`, `sync.js`, `theme.js`, `time-tasks.js`, `workspace.js`

登入／UID／同步／Store／Classic 初始化維持原位及載入順序；僅其既有 import 指向新實作。`server.js` 是 Express 根入口，`playwright.config.js` 是測試入口。`package.json`、`package-lock.json`、`vercel.json`、`metadata.json`、兩個 HTML 與 `tailwind.config.cjs` 保留外部工具／主機契約。未清理無關 Vercel 分支設定。

## 相容與風險

Express 對舊 URL 以 sendFile 回傳 compat 模組／原 CSS；Vercel 使用等價的精確 rewrites，不改 UI 路由。JS 轉接使用 `/src/…` 絕對公開路徑，將所有匯出轉交給 canonical 模組，避免直接 HTTP redirect 可能造成的雙實例。只有舊 URL 多一次既有類型的轉接 import；站內已直接引用 canonical 路徑。此部署契約是網域根路徑，不支援將 compat 直接複製至任意子路徑。

Express 保留 no-store／無 ETag／無 Last-Modified；不新增快取或永久 redirect。Vercel CDN 的實際路由需在 Draft Preview 檢查，尚未部署 Production。純 Fixtures 包不含 compat，也不需要伺服器轉接，因所有資源使用新相對路徑。

第一輪 JSON 對照作為歷史 hash 基準保留。第二輪 map 記錄完整相容表與產品 source hash；測試僅忽略 import 路徑來核對產品邏輯未改。伺服器例外只新增明確的靜態相容路由。

## 驗證

結果以 Draft PR 實際記錄為準。新增 HTTP／瀏覽器檢查涵蓋 32 個舊 URL（HTTP 200、正確 MIME／內容／cache headers）、14 個純模組新舊匯出實例相同，以及 1440／390／320px 的首頁、課程、王國、同步與地圖預覽。沿用 199 項單元測試、原有 Fixtures／Mock 登入、pending、Design A、成長及學習回歸。所有測試使用 Mock 或 RAM-only 本機模式；不驗證真實帳號、Firebase 或實體手機。
