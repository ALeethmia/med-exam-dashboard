# 2027 一階醫師國考 · 學習工作台

HTML / JavaScript / Express 學習儀表板，考試目標日為 2027 年 1 月 16 日。

## 開發

已使用 Node.js 24、npm 11 驗證。

```sh
npm ci
npm run build
npm run dev
```

`PORT` 預設為 3000。localhost / 127.0.0.1 自動使用本機模式，**不初始化正式 Firebase**。在其他測試主機使用 `?mode=local` 也會啟用本機模式。學習紀錄保存於瀏覽器 localStorage；介面會顯示本機模式。

Tailwind CSS、Lucide、React / Recharts 趨勢圖從鎖定的 npm 套件產生在 `public/`，已提交產物，靜態部署可直接使用。修改樣式或模板後請重新執行 `npm run build`。Firebase SDK 仍使用原有 CDN；圖表載入失敗時顯示提示，學科與首頁保持可用。

## 功能

- Quest OS 共用版型：總覽、科目、週計畫、行事曆、統計、角色與成就六個主要導覽。作息、運動與專注計時收在行事曆次導覽。
- 首頁以等寬雙欄呈現今日任務與四科進度，另提供本週進度及近期日程摘要；手機版改為單欄。
- 淺色、深色、跟隨系統模式；選擇保存於 `med_exam_theme`。
- 每日學習規劃器以 Asia/Taipei 日期管理自主安排的任務：跨科選擇章節／課程、自由任務、選填預計分鐘、編輯、完成／取消、上下排序、延後、複製與刪除復原。空白日期不會自動加入預設任務；日期選擇與歷史列表可查看過去或未來安排。
- 每個新任務首次完成獲得 20 XP；改名、排序、延後、取消／重新勾選或刪除／復原均沿用相同 ID，不能再次領取。每 100 XP 升一級，每週挑戰為 10 個獲獎任務，週一重新計算。舊課程與時間目標 XP 繼續合併計算；角色頁可查看舊時間目標歷史。
- 初次啟用不回填歷史 XP；既有完成紀錄不會被清除或重置。
- 三個基本成就：首次任務、單日三個任務、累積十個任務。無大型 RPG 系統。

已完成共用 Design Tokens、App Layout、首頁及四科清單整理。四科共用課本／課程目錄與章節內容雙欄，首次開啟依教材順序呈現第一章；手機使用章節選單。生理依 FC 照片目錄排列七章、39 節，頁碼與原始 ID 保持一致。讀書週次篩選獨立收合；科目頁只顯示課程、頁碼／時長、完成勾選與進度，不顯示複習建議、重點或筆記。科目頁只管理課程完成進度；今日任務另行記錄，勾選任務不會完成課程。任務的「課程」按鈕會清除科目搜尋／週次篩選、切換章節並定位原始課程。章節選擇保存在 `med_exam_subject_selection_v1`，不寫入 Firebase。

月曆與重要日程在桌面左右並排、窄螢幕上下排列，月曆維持緊湊尺寸並支援鍵盤開啟行程；作息表保留原時段、以簡短課表呈現。統計的 75% 線只代表進度參考，不代表國考及格機率。週計畫當週預設展開、其餘週收合，保留所有原內容、勾選及進度算法；可從任一週開啟課程選擇器，仍須使用者選擇並確認才建立每日任務。原整週勾選仍會依既有算法顯示 100%，介面標明其來源，不與每日任務綁定。既有導覽排序設定保留於 localStorage，六項固定主導覽不再使用拖曳排序。

## 資料相容性與同步

保留原有 `videos`、`biochem`、`physiology`、`pharmacology`、`checklist`、`habits/YYYY-MM-DD`、`custom_events` 路徑、欄位與 ID。四科共 115 個勾選項目（生理 39、解剖 30、生化 8、藥理 38），讀書計畫為 16 週。

科目與習慣只更新操作涉及的 ID；行程只更新涉及的日期。失敗的雲端學習寫入保存在 `med_exam_pending_writes_v1`，重連或按「重試同步」後再送出。行程的同日陣列仍沿用既有結構，並未改成完整的多使用者協作模型。

舊遊戲化 `gamification/v1/days/YYYY-MM-DD`、`gamification/v1/awards/{subject}__{itemId}` 與本機 `med_exam_gamification_v1` 保留。新的時間目標使用 `gamification/v2/timeTasks/YYYY-MM-DD/{morning|afternoon|review}`，欄位為 `complete`、`awarded`、`hours`；本機副本和失敗寫入佇列保存於 `med_exam_time_tasks_v1`。每個目標使用 Firebase transaction 保留已獲獎狀態，跨裝置共用同日目標，避免重複計算 XP。舊時間目標資料及本機鍵值保留，不轉換、不重置；角色頁保留唯讀歷史，首頁改用新規劃器。新舊遊戲化寫入失敗均不阻擋原有學習紀錄。Google 登入只控制存取身分；既有資料仍使用原本的共用路徑，沒有搬移到使用者子目錄。

正式環境的 Firebase Security Rules 不在此 Repository 中，也未修改或部署；需要允許新命名空間的讀取與 transaction 才能雲端同步成就。XP 是個人學習提示，不是可信任的競賽計分。既有跨裝置同步已由擁有者確認正常；本次新規劃器的正式 Firebase 讀寫未進行測試。

沿用既有公開 Firebase 前端設定，並依擁有者核對結果修正 API 金鑰第 9 個字元的大小寫，沒有新增私密憑證。`.env.example` 的 `FIREBASE_API_KEY` 並不會被程式讀取。不要提交 `.env`、服務帳戶檔或其他秘密。

## 驗證

```sh
npm run lint
npm test
npm run test:browser
```

瀏覽器測試可使用系統 Chromium；指定其他路徑可設定 `CHROMIUM_PATH`。若沒有系統 Chromium，可使用 Playwright 安裝的瀏覽器：`npx playwright install chromium`。

測試包含原有課程資料雜湊比對、各科計算、搜尋／勾選／批次操作、主題記憶、手機溢位、台北跨午夜、XP 去重、行程文字安全及隔離的 Firebase 替身。瀏覽器測試會阻擋所有外部請求，**不讀寫正式 Firebase**。

Vercel 正式部署設定未修改；此分支需先經 PR 審查再合併。靜態資產包含第三方程式，授權見 `public/THIRD_PARTY_NOTICES.txt`。

## Google 登入與私人同步

正式網站必須先完成 Google 登入，且 UID 符合 `owner-config.js` 的 `OWNER_UID`，才會建立 Realtime Database 連線、載入學習介面及重送待同步紀錄。未授權帳號會登出並顯示拒絕訊息；允許的 UID 未設定時，所有帳號均無法開啟學習介面或啟動同步，不會自動將首次登入者指定為擁有者。本機及 `?mode=local` 仍完全隔離正式資料庫。登出會斷開資料庫並重新載入登入畫面，不清除 localStorage 或既有紀錄。

Firebase Console 需啟用 Authentication → Google，並在授權網域加入正式網站網域；若測試 Vercel Preview 登入，該預覽網域也須加入。尚未有 Firebase 使用者時，可先在已授權的預覽網域以本人 Google 帳號登入；`OWNER_UID` 留空時，登入畫面只顯示該次登入的 UID，隨即登出，不啟動學習介面或資料庫。將本人 UID 填入 `owner-config.js` 並使用相同 UID 設定 Database Rules 後，再部署正式站。已授權登入後，側欄「帳號與同步」可查看與複製 Firebase UID。登入不會自動變更 Security Rules：目前到期的規則仍須由專案擁有者更新。

單人使用且不變更原有資料路徑時，可將 Realtime Database 根層存取限定為本人 UID（將下列佔位文字換成網站顯示的 UID，檢查既有子路徑是否還有其他授權規則）：

```json
{
  "rules": {
    ".read": "auth != null && auth.uid === 'YOUR_FIREBASE_UID'",
    ".write": "auth != null && auth.uid === 'YOUR_FIREBASE_UID'"
  }
}
```

此規則由使用者在 Firebase Console 審查並發布，本專案不會部署規則或操作正式資料庫測試。這是單人存取限制，沒有新增多人帳號隔離或資料驗證模型。原公開 Web 設定移至 `firebase-config.js`，API 金鑰第 9 個字元依擁有者核對結果修正為大寫，其餘設定未變；它不是服務帳戶私鑰，也不取代 Security Rules。真實 Google 登入仍須在已授權的部署網域上驗證。

網站端 UID 檢查只限制正常介面流程，不能取代 Database Rules，也不能阻止其他人完成 Google 身分驗證或出現在 Authentication 使用者清單。資料庫必須獨立限制同一個擁有者 UID。`?mode=local` 保留無雲端連線的本機預覽能力。

## 每日任務資料與衝突處理

- 新資料路徑：`gamification/v3/planner/tasks/{taskId}`。每個任務保存 `title`、`date`、`minutes`（選填）、`links`（只含原始課程 path／ID）、`complete`、`deleted`、`order`、`createdAt`、`_versions`（各欄位操作 ID）、`award`（首次完成的 20 XP 與獲獎日期）。不搬移原課程或任何舊遊戲化資料。
- 本機鍵：`med_exam_daily_planner_v3`，包含 tasks 與 pending；本機模式使用獨立 `med_exam_daily_planner_v3_local`，避免預覽任務混入正式佇列。舊 localStorage 鍵與資料維持原樣。
- 每次同步只 transaction 一個 task ID，並只套用修改欄位，保留其他欄位及其他裝置新增的任務。首次 XP 與任務狀態在同一個 transaction 提交；跨裝置只共用一筆 award。刪除使用 tombstone 並永久保留 award，重試不增加 XP。
- 不同欄位合併；同一欄位若相較編輯時的版本已改變，且內容不同，停止該任務同步，保留本機意圖與雲端內容。首頁會顯示兩者，使用者選擇「保留本機修改」或「採用雲端修改」後再同步。沒有依裝置時鐘直接覆蓋資料。
- 失敗的意圖持久保存；登入後連線恢復、online 事件與「重試同步」會重送，處理舊回覆時只清除對應版本的意圖。Firebase 權限拒絕若取消了讀取監聽，修改 Rules 後需重新整理以重新訂閱。
- 延後移動同一 ID；「複製至今天」建立另一個未完成的學習活動，不複製原 award。XP 是自我回報的鼓勵值，不驗證實際投入時間或知識熟練度。
- 最近課程、未完成課程與週計畫只是篩選入口，不自動選取或加入任務。課程清單由既有 `window.studyData` 建立薄型呈現介面，沒有另一份課程資料。

你已發布的根層 `.read`／`.write` 限定擁有者 UID 時，授權會涵蓋新的 v3 子路徑，預期不需增加 Rules。未在 Console 發布任何規則；若實際另有 `.validate` 或其他設定，需在預覽部署由擁有者確認。前端 UID 檢查仍不能取代 Rules。

所有自動化新任務測試使用隔離的本機或 Firebase 替身，驗證兩裝置欄位合併、同欄位衝突、離線重送、XP 去重、刪除保留獎勵、傳送途中再編輯及操作介面。真實新任務 OAuth／跨裝置／網路斷線測試留待已授權的預覽網域由擁有者驗證，沒有使用正式資料庫做測試。
