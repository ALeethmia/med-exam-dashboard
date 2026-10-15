# A：同步 UX 修正與 B1 交付

正式基準 main `4013321ad6c2fdaba4f149f24781b3835f0b6b06`，版號維持 1.0.0。

## A 的實作範圍

- `sync.js` 僅修改 `status()`：在 `.workspace-toolbar` 後建立獨立區域，不放進 `.workspace-controls`。
- true／true 顯示「尚未取得可靠寫入確認」；true／false 顯示「觀察到不同數值，先後尚待確認」。均說明快照未驗證為伺服器最新值。
- 有待處理項目時顯示可發現的摘要，詳細內容預設收合。錯誤／離線有不同說明，正常狀態只有簡潔連線標示。
- 顯示課程名稱、完成／未完成及供定位的路徑；保留原本採用雲端、重新套用本機及確認對話框。
- 穩定重用 details、各列及按鈕，不在每次狀態更新 replaceChildren；保留展開與焦點。
- `styles/workspace.css` 僅新增主題變數樣式及窄螢幕安全間距。
- 所有 pending／review／conflicts／flush／resolve／readiness 決策均未改動。新增測試以 SHA256 鎖定 `status()` 以外的 sync 原始碼與正式基準完全相同。
- 原 repository layout 完整性測試只更新這兩個已核准呈現檔的精確 hash，其餘檔案仍核對原始 hash；沒有刪除或放寬完整性檢查。

**此版本不會自動處理使用者的兩筆舊 pending，也不宣稱同步機制已改善。** B1 只研究，不接入 Production。

## 驗收截圖

截圖使用實際 `sync.js` 呈現函式與正式 CSS，放在隔離工具列／學習內容 fixture；全部為合成資料，不是真實帳號或完整 Dashboard E2E。瀏覽器為 Chromium；手機為寬度模擬，非實體手機。

| 畫面 | 證據 |
|---|---|
| 桌機 1440px、淺色、展開 | [截圖](evidence/1440-light-same.png) |
| 手機 390px、深色、展開 | [截圖](evidence/390-dark-same.png) |
| 手機 320px、淺色、展開 | [截圖](evidence/320-light-same.png) |
| true／true | [截圖](evidence/390-same.png) |
| true／false | [截圖](evidence/390-different.png) |
| 離線 | [截圖](evidence/390-offline.png) |
| 同步失敗 | [截圖](evidence/390-failure.png) |
| 正常 | [截圖](evidence/390-normal.png) |

## 測試與重現

- Build、Lint、現有單元／同步安全測試及新增呈現不變量測試。
- 12 項 A UI 瀏覽器測試：三種寬度 × 兩種主題、五種狀態、兩個原人工決策；檢查無橫向溢出、鍵盤可操作、展開與焦點保留、未確認 pending 不會因重新渲染消失。
- 既有 CI 的 5 項版本／完成日期瀏覽器回歸及 canonical auth／Fixtures／learning regression。
- CI 新增執行 A UI 與 B1 的 6 項決策模型。真 SDK Emulator 研究為獨立本機執行，未在 CI 假裝執行。
- B1 的 12 項 SDK Emulator 結果、限制及執行指令見 [B1 研究](B1_SERVER_VERIFICATION.md)。

```sh
npm ci
npm run build
npm run lint
npm test
npx playwright install chromium
npx playwright test tests/browser/sync-ux.spec.js --reporter=line
node --test tests/sync-b1/reconcile-model.test.mjs
```

如需重新截圖，可設定 `SYNC_UX_SCREENSHOTS=/tmp/sync-ux` 執行該 UI 測試。

A 的回退只需還原呈現函式與新增 CSS；不接觸 pending、Firebase、日期或 XP。

Draft PR 僅供審查；不 Merge、不發布 Production、不調版號、不建立 Tag／Release。沒有讀寫正式 Firebase 或使用真實帳號。
