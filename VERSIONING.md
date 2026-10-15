# Becoming 版本管理

## 目前狀態

版本分支已準備 **v1.0.0 — Chapter 1：初始之地**，候選 metadata 為 1.0.0。尚未合併或部署 Production，也未建立 v1.0.0 Tag／GitHub Release；不能把候選版號當作正式發行完成。

現有正式版本仍為 v0.2.0，[Tag／Release](https://github.com/ALeethmia/med-exam-dashboard/releases/tag/v0.2.0) 已於 2026-10-12 發布，保持不變。前次唯讀審計基準 main 為 `96ef25ec23fecd063f0871733a0081ce61833e78`；Production READY／Source SHA 相符。實際 v1.0.0 Tag 必須指向未來版本 PR 合併、部署驗證後的 Commit。

## 唯一來源與顯示

`package.json` version 是唯一人工維護的產品版號。package-lock.json 的 version 與 packages[""] 的 version 為同步副本，不是獨立來源。使用既有 `npm version <版本> --no-git-tag-version --ignore-scripts` 更新，再執行 `npm run build`；不升級依賴，不引入新的發布工具。

既有 `scripts/version-info.mjs` 從 package 產生 `public/app-version.json`；不要手改產物或偽造 SHA。Vercel build 使用有效的 VERCEL_GIT_COMMIT_SHA；本機沒有時 commit 為 null，介面省略。版本 UI 讀取產物，無資訊時顯示提示，不阻擋讀書。`npm run lint`／版本測試核對 package、lock 根版本與產物一致。

## 版本與章節規則

| 版本 | 定義 |
| --- | --- |
| v1.0.0 | Chapter 1「初始之地」正式穩定版，目前為待審查候選 |
| v1.0.x | 相容性與錯誤修補 |
| v1.x.0 | 未來新增相容功能，需另外授權 |
| v2.0.0 | 有實際重大不相容變更時評估，不直接等同 Chapter 2 |

沿用 MAJOR.MINOR.PATCH 與 MAJOR.MINOR.PATCH-beta.N；普通 Commit 不自動升版。章節、產品與 Schema 各自獨立；1.0.0 不代表搬移 questOS/v1、gamification/v1／v3 或新增永久欄位。早期 0.3／0.4／0.5 的方向不再作為固定發行承諾。

## 驗收證據與界線

既有 CI、PR #18 新舊資源驗證與正式站唯讀 Smoke 已通過。本次版本候選的必要測試與 CI 結果記在 Draft PR，不將舊版結果當作尚未部署的 1.0.0 正式驗收。

使用者已在最新 Production 完成並回報以下六項人工驗收：

1. 登入與同步狀態正常。
2. 課程進度與首次完成日期正確。
3. 今日任務與讀書計畫正常。
4. 領主等級、建築與編年史正確。
5. 歷史 XP、成就與既有紀錄保留。
6. 重新整理／跨裝置一致，沒有異常 pending。

這是**使用者人工驗收回報**，不是 Codex 自行執行真實 Firebase 端到端測試，也不涵蓋所有失敗／競爭情境。正式 Rules 的執行個體／已發布狀態／UID 一致由使用者先前確認；本輪不存取真實資料、不變更 Rules。

## 明確分階段發行

1. 最新 main 建立版本分支，更新 metadata 與必要文件，執行 npm ci／build／lint／unit、版本一致性與必要 Mock 瀏覽器測試，建立 Draft PR。
2. 人工 Code Review 與 CI 通過後，另行取得 Ready／Merge／正式部署授權；本次僅完成第一步，不合併。main 合併可能觸發現有 Vercel 自動部署。
3. 確認 Production READY、Source SHA 等於正確 Merge Commit、正式版號 1.0.0，並完成必要唯讀 Smoke；不擅自操作真實學習紀錄。
4. 另獲 Tag／Release 授權後，才對已驗證 Commit 建立 v1.0.0 Tag、發布非 prerelease 的 GitHub Release，附上 [CHANGELOG](CHANGELOG.md) 與已知限制。不移動 v0.2.0 或已發布的 Tag。

只更新版號不改功能、XP 規則、建築門檻、Firebase 或歷史資料。新任務仍不發 XP，歷史 XP／成就與 pending 原樣保留，不新增 Admin SDK 或交易 API。

## 風險與回退

課程 bool 與首次日期不是跨路徑原子交易；舊分頁可能保有舊獎勵行為。發布前保存未同步操作並關閉舊分頁，保留衝突提示與待核對意圖。

發現資料風險時停止相關操作與後續發布，先調查再提出修補或資料契約相容的部署回退。不得整庫還原、清空 pending、重播 XP 或回到不相容舊客戶端。已發布 Tag 不移動，修補使用新 patch 版本。未來章節、App 化、C 方案與私人站清理不是 v1.0.0 的前置條件。
