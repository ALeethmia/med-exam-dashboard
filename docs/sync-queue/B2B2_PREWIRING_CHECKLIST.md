# B2-B.2 正式接線前檢查清單（未授權實作）

- [ ] 盤點並統一所有課程 bool／刪除入口，禁止舊 localStorage writer 與 IDB 同時作活動權威。
- [ ] 決定 SDK writer 的可信來源與原 Promise 契約；不能把任意 resolved Promise 當 Firebase 收據。
- [ ] 實際 Auth／runtime epoch 橋接及 queue client 所有權完成審查；ID token 不存入 IDB／日誌。
- [ ] 受控版本切換：舊分頁退出、UID scoped 原始備份及雜湊、兩階段啟用紀錄、可中斷恢復。舊分頁退出不能由心跳單獨證明。
- [ ] 不接管未綁 UID 的歷史資料；兩筆 true／true legacy 不因同值就結案。
- [ ] IndexedDB 不可用、配額、逐出與 Safari 實機驗收；已切換後不能偷偷降回另一套佇列。
- [ ] 決定未知 flight／session 關閉的獨立恢復政策。原型故意保留 blocker；不放寬 settleOwnFlight 冒充跨 session 證據。
- [ ] 若使用可信 REST GET：驗證端點、token、no-store、redirect、401／403、逾時與證據綁定；同值不是舊寫入收據。
- [ ] 離線／未知意圖與跨裝置新紀錄不同時，保留人工選擇；不以本機時間／generation 推定伺服器先後。
- [ ] 確認首次日期獨立版本交易、Design A、歷史 XP／pending 語意完全保留；結案不觸發 study-completed。
- [ ] 完成 B2-A＋B2-B.1 全部回歸、正式同步 Mock、真 Chromium 多分頁及原生 Safari；分開標示模擬與正式證據。
- [ ] 明確 UI：本機已保存、等待原確認、已確認待本機結案、未知 blocker、真正需選擇。inspect 只是診斷，不作同步權威。
- [ ] 安全停用路徑先驗證：停新 claim、保留 IDB／備份、不得重播原 legacy；不得為回退取消已接受的雲端寫入。
- [ ] 另外取得正式接線、任何真實 legacy 處理與部署授權。本 PR 不包含這些權限。
