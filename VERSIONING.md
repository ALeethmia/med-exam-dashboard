# Becoming 版本管理

使用 `MAJOR.MINOR.PATCH` 與 `MAJOR.MINOR.PATCH-beta.N`。目前處於 0.x，版本發布由使用者明確決定，不自動升至 1.0。

## 唯一來源與顯示

`package.json` 的 version 是唯一人工維護的產品版號。package-lock.json 根層版本是 npm 的同步副本，不是另一套產品版號。修改版號可執行 `npm version <版本> --no-git-tag-version --ignore-scripts`，再執行 `npm run build`；不要每個普通 Commit 都升版。

build 從 package.json 產生 `public/app-version.json`（已追蹤的靜態產物，勿手改），頁尾由 version-ui.js 讀取，不讀取完整 package.json。Vercel build 可附帶有效的 VERCEL_GIT_COMMIT_SHA，介面只顯示前七碼；缺少或無效時省略，不使用假的 SHA。沒有建置中繼資訊時顯示無法載入，不阻止讀書功能。`npm run lint` 檢查 package、lockfile 與產物版本一致；修改版本後需先 build。

## 選擇版號

- Patch：錯誤、排版、文案或不破壞相容性的修正，例如 `0.2.0 → 0.2.1`。
- Minor：新增可使用功能或系統，例如 `0.2.0 → 0.3.0`。
- Major：重大不相容變更或人工決定發布成熟的 1.0。資料格式變更仍須另外檢查相容性、備份與遷移策略，提高 Major 不能代替它們。
- Beta：未完成正式驗收，例如 `0.2.0-beta.1 → 0.2.0-beta.2`；普通 Commit 可以保持同版號，以部署 SHA 區分。

方向：`0.2.0-beta.1` 為 Phase 2A 預發布；驗收後可選 `0.2.0`；未來 `0.3.0`（Phase 2B）、`0.4.0`（王國經濟／建築）、`0.5.0`（軍隊／遠征）僅是規劃，不預建 Tag，不強制功能與版號綁定。

## 人工發布流程

1. Feature branch 開發，建立或更新 PR，更新 CHANGELOG。
2. 執行 lint、unit tests、build、browser tests，核對資料相容性與 Vercel Preview 的 Source SHA。
3. 人工審查與正式 Firebase 驗收，確認後由使用者決定合併 main。
4. 核對 main 上 package.json 與 CHANGELOG，再以相同版號建立 `v<版本>` Git Tag。
5. 使用者明確決定建立 GitHub Release，附上 CHANGELOG 摘要。Beta 發布應標為 prerelease。

本專案沒有自動合併、Tag、Release 或正式部署腳本，不引入 semantic-release／Changesets。版本管理本身不修改 Vercel 設定；main 合併可能觸發既有正式部署，因此合併仍需使用者決定。

## 產品與 Schema 分離

產品 v0.2.0 不代表資料路徑升至 v0.2.0。保留 `questOS/v1/...`、`gamification/v1/...`、`gamification/v3/...` 等原路徑，不為更名或升版刪除／搬移資料。新日期路徑 `questOS/v1/courseFirstCompletion` 已記錄於 CHANGELOG。

## 正式發布前人工驗收（目前未完成）

- Firebase Rules 允許 OWNER_UID 存取新日期路徑，未授權帳號無法讀寫私人資料；不要把前端 UID 檢查當成資料庫授權。
- 原課程完成、XP／成就、Planner、生活目標及運動歷史均保留。
- 在已授權網域的兩裝置確認首次日期同步、移除、重新設定及離線重連／同 ID 衝突。

這些須使用本人登入的真實 Firebase 驗證。單元與瀏覽器 Mock 測試只能證明程式行為，不能宣稱正式環境已驗收。
