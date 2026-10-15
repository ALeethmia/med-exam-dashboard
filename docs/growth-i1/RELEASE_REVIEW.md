# Growth I1 整合審查：NO-GO／Draft

日期：2026-10-15（Asia/Taipei）。基底 main `26786ef6aa5c939190a665789773add0e4dc883f`；已核對 GitHub 最新 main。獨立分支 `codex/growth-i1-integration`，未修改原工作樹、Firebase、Rules 或 Vercel 設定，未部署。

## 範圍與資料契約

沿用已核准 Growth I1：Lite 建築／renderer/input、40/40/20 四里程碑平均、`1 + floor(19R)`、Design A、歷史獎勵保留、UID storage 與首次快照 gate。原 `territory-core.js`／`study-core.js`／`growth-core.js` 與 Firebase 公開 Web 設定、owner policy 都與 main 相同。沒有把驗收包內刻意留空的設定帶入產品，也沒有加入 I3.2 服務、Admin、completionSync、receipt、opId、course revision 或 Rules 範本。

完成狀態由有效課程 bool 推導；多連結須全部完成，無效／未知／未讀取者不猜測。一般任務仍寫自己的 bool。原 task.complete、award、awarded、日期與 XP 保留；無永久 Schema 變更，無遷移。成長只讀確認的課程快照；預覽不更動真實階段。

本輪補上已驗收候選缺少的本機模式完成訊號：只有明確的 local Store 初始化成功後才標 ready，顯示「本機示範（未連線）」。Firebase 路徑仍只能用訂閱成功／失敗決定就緒。未綁定 UID 的舊快取不自動匯入。canonical 手機回歸另確認原 sidebar footer 隱藏會使帳號按鈕不可操作；現在把同一個帳號按鈕在窄螢幕移至既有工具列，桌機位置保留，登出移除監聽。沒有新增帳號功能或重設計王國。

### 讀寫路徑核對

|既有路徑|新版行為|
|---|---|
|videos、biochem、physiology、pharmacology 的課程 ID|保留 bool 項目級 multi-location update，任務／科目共用入口|
|gamification/v3/planner/tasks|一般任務、metadata、原欄位版本及 batch CAS 仍可寫；linked complete 不新增／更新；不新增 award|
|gamification/v2/timeTasks|保留 complete，保留既有 awarded；不新增 awarded=true|
|gamification/v1/awards|唯讀確認歷史；syncGame 不再重播本機獎勵|
|questOS/v1/courseFirstCompletion|保留原首次日期／編輯／清除標記 transaction|
|questOS/v1/training、habits|原生活／訓練操作及訂閱保留|
|questOS/v1/adaptiveStudy/settings、custom_events、checklist|原設定、行事曆及計畫寫入保留|
|.info/connected|原連線訊號，重連重新訂閱|

沒有新增 Firebase 資料路徑。UID quarantine 是本機 scoped storage，並非 Firebase 欄位。Mock／測試資料全部放在 tests/fixtures；產品入口不載入這些模組。

## 正式 Rules：無法判定，合併阻擋

Repository 無正式 Rules、firebase.json 或 .firebaserc；目前沒有可用的 Firebase 管理連線／已確認的規則版本。沒有用匿名資料庫請求探查個資，沒有讀取正式學習紀錄。Web 設定／Vercel metadata 不能證明 Rules 內容。

在取得由管理者確認的 instance、Rules 版本及 Rules 原文後，須在 Emulator 測上述所有現有寫入，以及首次空快照、權限拒絕和父層 grant。**現在不能宣稱相容，不得直接套用舊 I3.2 Rules 範本。**

## 舊 client XP 切換策略（待另行授權執行）

1. 合併前先核對正式 Rules，離線建立最小規則方案：新版課程／任務 metadata 仍可寫；歷史 award／awarded／XP 保持；拒絕新增獎勵及修改／刪除歷史獎勵。須檢查祖先 write grant，不能假設子節點 deny 或 validate 能阻止父層授權／刪除。沒有現行 Rules 前不產出可套用 JSON。
2. 在獨立 Emulator 以舊 client 寫入形狀重播「新增 task award、awarded false→true、重送舊 cached award」，確認全部遭拒；再驗證新版 bool、metadata、日期與生活功能仍可寫。必要時拆分允許的更新形狀，不能為停 XP 而封鎖所有學習操作。
3. 安排短暫維護窗口，要求舊頁停止操作並重新整理；確認所有未決本機意圖仍被保留。先以另行核准的 Rules 擋住舊寫入，再發布／啟用新版。只靠通知刷新不構成安全保證，離線舊頁可能恢復連線。
4. 依另行授權的帳號／測試資料驗證正式讀寫及舊版拒絕提示，確認所有 gate 後才解除維護。此 PR 不做任何正式資料測試或 Rules 更新。
5. 回退先停止有問題的操作，使用唯讀頁／修復版；保留保護性 Rules、全部歷史資料和本機 pending。**不可回退成仍能發獎的舊前端＋舊寬鬆 Rules，不可還原整庫、清空獎勵或自動補發。**

這是具體執行順序，不表示規則已實作或舊 client 已被阻擋；目前仍為正式阻擋。

## 歷史待同步意圖

planner 含 awardDay、舊 linked complete，time intent 含 awarded=true 者保留並暫停送出；UI 顯示需核對。原始 cache／intent 另作 UID 本機 quarantine，不刪除、不自動重播或補發。未綁 UID 的舊鍵保持原樣，不自動綁到登入帳號。一般新意圖仍走原版本／重試流程。恢復歷史 pending 須先辨認來源 UID、核對確認的遠端紀錄，逐筆人工決定；不得以新 op 或清空佇列解決。

## 已知限制

- 普通課程 bool 保留既有多裝置 last-write 行為；first-date 與 bool 仍是獨立寫入，並非跨路徑原子交易。
- batch 保留 task 分支 CAS，fresh course preflight 只能縮小其他裝置在提交前更新課程的窗口，沒有聲稱跨分支瞬時一致。
- 正式 Auth／Firebase、實體 Mac 觸控板／手機尚未測試。Mock 結果不可視為正式端到端通過。
- 原瀏覽器套件仍包含舊任務 +20 XP、舊互斥建築／原始 localStorage fixture 的斷言，整套未宣稱通過。下列被核准的新契約由 Growth I1 測試覆蓋；另重跑不受契約改變影響的原版本資訊／課程日期 5 項。

## 驗證與 CI

本機：172 項個別單元案例通過（原 128＋新 44），npm test 14 個檔案通過；npm run build、npm run lint 通過。Chromium 1440/390：主要 48、失敗／重試 8、學習功能 14；原版本／日期 5 項通過。canonical auth/Store、手機帳號入口、登出、本機模式及 SDK 失敗共 6 組通過。未提交大量截圖、ZIP、node_modules 或舊美術副本。

新 workflow `.github/workflows/growth-i1.yml` 僅做無 secrets、無部署的 npm ci／unit／build／syntax／Mock browser。只在 PR 事件執行，避免推送和 PR 雙跑。`vercel.json` 只停用本分支 Git 部署，未改動遠端設定或 main 部署行為；推送後另查核沒有此 commit 的 Vercel 部署。

重現：`npm ci && npm test && npm run build && npm run lint`。Mock browser 使用 `npm run build:growth:review` 生成被忽略的 `.growth-review/`，以 Python 8811 提供它、`PORT=8812 npm start` 提供 canonical root，依 workflow 命令執行。所有外部 SDK／DB 在瀏覽器攔截，無真帳號。靜態 Fixtures 只使用 RAM。

已核准視覺基準（非本 PR 正式 Firebase 驗證）：
- https://becoming-a1-art-review.abuzzowl.chatgpt.site/growth-i1/
- https://becoming-a1-art-review.abuzzowl.chatgpt.site/downloads/becoming-growth-i1-review.zip
- 既有 ZIP SHA256：c87da08bcd499fc1c5be92ae35c8a8b85d8165ad65dd83cdbf171b36ac2b63af

## 合併／部署檢查清單

- [ ] 取得及驗證正式 Rules；建立經 Emulator 驗證的最小停發／合法讀寫方案。
- [ ] 舊 client、離線回歸及歷史 pending 核對方案獲准，沒有自動清空／補發。
- [ ] CI 通過；reviewer 確認範圍、舊測試契約差異及已知 last-write／日期限制。
- [ ] 在另行授權的隔離 Firebase 測試環境完成真 Auth、Rules、空資料、錯誤、登出、帳號切換及重連。
- [ ] 使用者另行授權 Merge、Rules 發布與正式部署；尚無此授權。
- [ ] 依上述維護切換順序執行，發現異常維持唯讀並保留資料。

以上未完成前保持 Draft／NO-GO。本輪不合併、不部署、不改 Rules 或資料。
