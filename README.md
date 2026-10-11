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
- 今日任務以 Asia/Taipei 日期記錄三個時間目標：上午讀書 2 小時、下午讀書 2 小時、複習 1 小時。使用者完成後勾選，首頁顯示完成目標時數；不自動認定任何課程已完成，也不是計時器量測時數。
- 每個時間目標每天首次完成獲得 20 XP，取消與重新勾選不重複獲得。每 100 XP 升一級；每週挑戰為 10 個任務，週一重新計算。舊課程任務與 XP 紀錄保留，不新增舊課程任務獎勵。
- 初次啟用不回填歷史 XP；既有完成紀錄不會被清除或重置。
- 三個基本成就：首次任務、單日三個任務、累積十個任務。無大型 RPG 系統。

已完成共用 Design Tokens、App Layout、首頁及四科清單整理。四科共用課本／課程目錄與章節內容雙欄，首次開啟依教材順序呈現第一章；手機使用章節選單。生理依 FC 照片目錄排列七章、39 節，頁碼與原始 ID 保持一致。讀書週次篩選獨立收合；科目頁只顯示課程、頁碼／時長、完成勾選與進度，不顯示複習建議、重點或筆記。科目頁只管理課程完成進度；今日時間目標獨立記錄。章節選擇保存在 `med_exam_subject_selection_v1`，不寫入 Firebase。

月曆限制為 640px，作息表保留原時段、以簡短課表呈現。週計畫等既有內容暫以共用樣式相容；週計畫當週預設展開及任務編輯等需求仍待後續分階段實作。既有導覽排序設定保留於 localStorage，六項固定主導覽不再使用拖曳排序。

## 資料相容性與同步

保留原有 `videos`、`biochem`、`physiology`、`pharmacology`、`checklist`、`habits/YYYY-MM-DD`、`custom_events` 路徑、欄位與 ID。四科共 115 個勾選項目（生理 39、解剖 30、生化 8、藥理 38），讀書計畫為 16 週。

科目與習慣只更新操作涉及的 ID；行程只更新涉及的日期。失敗的雲端學習寫入保存在 `med_exam_pending_writes_v1`，重連或按「重試同步」後再送出。行程的同日陣列仍沿用既有結構，並未改成完整的多使用者協作模型。

舊遊戲化 `gamification/v1/days/YYYY-MM-DD`、`gamification/v1/awards/{subject}__{itemId}` 與本機 `med_exam_gamification_v1` 保留。新的時間目標使用 `gamification/v2/timeTasks/YYYY-MM-DD/{morning|afternoon|review}`，欄位為 `complete`、`awarded`、`hours`；本機副本和失敗寫入佇列保存於 `med_exam_time_tasks_v1`。每個目標使用 Firebase transaction 保留已獲獎狀態，跨裝置共用同日目標，避免重複計算 XP。遊戲化寫入失敗只影響成就同步，不阻擋原有學習紀錄。本專案沒有新增身分／登入模型，遊戲化延續現有共用資料庫的範圍。

正式環境的 Firebase Security Rules 不在此 Repository 中，也未修改或部署；需要允許新命名空間的讀取與 transaction 才能雲端同步成就。XP 是個人學習提示，不是可信任的競賽計分。正式 Firebase 同步未在本次改版中測試。

既有公開 Firebase 前端設定維持原樣，沒有新增憑證。`.env.example` 的 `FIREBASE_API_KEY` 並不會被程式讀取。不要提交 `.env`、服務帳戶檔或其他秘密。

## 驗證

```sh
npm run lint
npm test
npm run test:browser
```

瀏覽器測試可使用系統 Chromium；指定其他路徑可設定 `CHROMIUM_PATH`。若沒有系統 Chromium，可使用 Playwright 安裝的瀏覽器：`npx playwright install chromium`。

測試包含原有課程資料雜湊比對、各科計算、搜尋／勾選／批次操作、主題記憶、手機溢位、台北跨午夜、XP 去重、行程文字安全及隔離的 Firebase 替身。瀏覽器測試會阻擋所有外部請求，**不讀寫正式 Firebase**。

Vercel 正式部署設定未修改；此分支需先經 PR 審查再合併。靜態資產包含第三方程式，授權見 `public/THIRD_PARTY_NOTICES.txt`。
