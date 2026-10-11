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

- 今日任務與四科進度首頁；統計、行事曆、讀書計畫、作息、運動各自分頁。
- 淺色、深色、跟隨系統模式；選擇保存於 `med_exam_theme`。
- 每天依 Asia/Taipei 日期固定推薦三個未完成項目，以目前讀書週次優先。完成任務直接更新原有學科紀錄。
- 每個學習項目首次作為今日任務完成獲得 20 XP，重複勾選不重複獲得。每 100 XP 升一級。每週挑戰為 10 個任務，週一重新計算。
- 初次啟用不回填歷史 XP；既有完成紀錄不會被清除或重置。
- 三個基本成就：首次任務、單日三個任務、累積十個任務。無大型 RPG 系統。

## 資料相容性與同步

保留原有 `videos`、`biochem`、`physiology`、`pharmacology`、`checklist`、`habits/YYYY-MM-DD`、`custom_events` 路徑、欄位與 ID。四科共 115 個勾選項目（生理 39、解剖 30、生化 8、藥理 38），讀書計畫為 16 週。

科目與習慣只更新操作涉及的 ID；行程只更新涉及的日期。失敗的雲端學習寫入保存在 `med_exam_pending_writes_v1`，重連或按「重試同步」後再送出。行程的同日陣列仍沿用既有結構，並未改成完整的多使用者協作模型。

遊戲化使用獨立 `gamification/v1/days/YYYY-MM-DD` 與 `gamification/v1/awards/{subject}__{itemId}`；本機副本為 `med_exam_gamification_v1`。XP 使用每項目的 Firebase transaction 避免重複獎勵。遊戲化寫入失敗只影響成就同步，不阻擋原有學習紀錄。本專案沒有新增身分／登入模型，遊戲化延續現有共用資料庫的範圍。

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
