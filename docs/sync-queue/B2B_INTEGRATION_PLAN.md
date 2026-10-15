# B2-B 未來最小接線計畫與風險

B2-A 只建立儲存／交易原型。**本文件不是接線、資料遷移或部署授權。**

## 尚未解決的邊界

1. `settleOwnFlight` 只確認原 session 提供的契約值；沒有實作 Firebase Promise／server-only GET 證據驗證。不能直接用在產品自動結案。
2. 原 session 關閉後，未知 flight 故意保持阻擋。跨 session 如何在不重送舊寫入的情況下，取得證據並安全結束 blocker，尚未實作。
3. 同 UID 舊版分頁仍可自由操作原 localStorage 與 SDK 寫入。本原型無法約束它們；不掃描、不刪除、不搬移舊 pending，也不假裝 BroadcastChannel 心跳能證明舊分頁已不存在。
4. IDB 是同 origin／同瀏覽器儲存區的協調，不是跨裝置一致性協定。generation 不能判定其他裝置哪次修改較新。
5. 配額、私密模式、資料逐出、OS 強制終止與不同瀏覽器仍需擴充測試。UID 篩選防止誤用，不阻擋同 origin 惡意程式直接存取原生 IDB。

## 下一輪最小順序

1. **先定資料權威與版本切換**：把所有新版 pending 生產者／確認者統一到同一儲存協議。舊版 localStorage 保持隔離，不能同時把兩份佇列都當權威。
2. **明確 legacy 接管程序**：需要可驗證的舊分頁退出／唯讀策略、原始 pending 備份與未知 SDK flight 的處理政策。若無法排除舊 writer，拒絕自動接管／刪除。另行授權才可處理真實 legacy 資料。
3. **Auth 生命週期橋接**：只用 Firebase 已驗證的 currentUser.uid 呼叫 bind；開始／結束／切帳與 runtime epoch 同步。Prototype session ID 是本機識別，不是歷史 UID／伺服器版本。
4. **受保護寫入 Adapter**：claim 必須 commit 才可呼叫原寫入；每個 flight 追蹤唯一原 Promise；成功證據只能 settle 對應 session／意圖。不得新增一份並行 Firebase 寫入或 XP 來源。
5. **唯讀核對 Adapter**：如選 REST GET，嚴格 origin／path、token、no-store、redirect、timeout、UID／epoch／generation guard。GET 值相同不是原寫入收據。未知 flight 不能因 Boolean 相同直接解除。
6. **跨 session 恢復政策**：為死掉的 owner 設計獨立、可測試的證據決策，再加入專用 CAS API；不能用心跳逾時當作「沒送出」。在政策通過前，保持 awaiting-proof／needs-choice，不偷偷清 blocker。
7. **產品 UI 整合**：沿用 A 的低干擾區域；未保存、已保存待送、未確認、需選擇分開顯示。儲存失敗不能顯示「已保存」。同課程新意圖須能顯示被舊 flight 阻擋。
8. **完整回歸**：真雙分頁交錯、SDK Promise 延遲／重連、跨 UID 舊 callback、崩潰邊界、storage 失敗／私密模式、保留 legacy，以及日期／XP／Design A。只有另外授權後才檢查正式環境，不用真實資料做本階段測試。

## 不變原則

- 不新增 Firebase Schema／Rules 或伺服器版本欄位。
- 不根據本機時間或讀到的當前 ETag 捏造舊操作先後。
- 完成狀態的核對／本機結案不派發 study-completed，不補首次日期、不發 XP。
- 不自動重播 legacy、清空 pending 或將未知 flight 重設 queued。
- 真正不同且缺乏可信基準的跨裝置狀態，仍保留人工選擇。

## 回退

B2-A 沒有產品接線，移除測試原型不影響正式資料；本輪沒有需要回退的正式資料變更。

未來 B2-B 若接線後需停用：停止新的 claim／發送／核對排程，保留 IDB intents、revisions、flights 及原 legacy 備份；不能回退成盲目重播 localStorage，也不能刪掉未知 flight 或重新發放 XP。已接受的 Firebase 寫入不可藉由清除本機資料「回滾」。
