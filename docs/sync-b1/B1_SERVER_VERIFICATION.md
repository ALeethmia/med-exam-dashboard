# B1：可靠伺服器核對研究（未啟用產品自動結案）

基準：main `4013321ad6c2fdaba4f149f24781b3835f0b6b06`；Firebase Web compat 9.22.0。
測試：RTDB Emulator 4.11.2、本機合成帳號與規則；沒有 Production 連線或真實紀錄。

## 方法比較

| 方法 | 證據／限制 | 適用建議 |
|---|---|---|
| `on(value)`／`once(value)` | SDK 可能先回快取與未確認本機寫入；快取 true、伺服器 false 已重現 | 可渲染觀察值，不能自動刪 pending |
| compat `get()` | 活躍查詢的快取可直接滿足請求；本機 Emulator 已重現 | 不是強制 server-only 的保證 |
| `.info/connected`／現有 ready | 分別代表連線、必要訂閱已回呼；不是寫入確認 | 保留生命週期 gate，不當成同步收據 |
| 原 `set/update` 完成 Promise | 可確認那次寫入；SDK 自己會保留未確認寫入並重送 | 優先追蹤原 Promise；不得另外重送同一意圖 |
| `transaction(v => v, undefined, false)` | 成功 committed 結果可作該次伺服器核對；但仍送出 PUT 寫入協定、需要讀寫權限，與 set/update 有取消／排序關係 | 僅為 B2 候選，不是免費／無副作用的唯讀 API |
| 鑑權 REST GET，禁用快取 | 避開 SDK 本機快取；ETag 可提供條件寫入基準，不能證明舊寫入成功；讀取後仍可能有競爭 | 若選用需補身分、token、來源／redirect、timeout 與錯誤契約；本輪僅測本機 REST |
| REST ETag + If-Match | Emulator 已驗證過期基準回 412、不覆寫新值 | 用於未來條件寫入的選項；不是本輪產品接線 |

## 實際執行的證據

`evidence/emulator-results.json` 記錄 12 項真 SDK → Emulator 檢查：

1. true 的相同狀態必須等成功交易完成才取得核對結果。
2. `once` 在活躍查詢可回 true 快取，伺服器實為 false。
3. `get` 同樣可能使用該快取。
4. updater 回 undefined 可在本機中止；committed=false 不代表可靠伺服器核對。
5. 斷線時未收到交易成功確認。
6. 重連後 stale hash 重試回傳伺服器 false，沒有覆寫成 true。
7. 相同值交易送出寫入協定；該單一葉節點情境未增加 value 變更事件。
8. 模擬規則允許讀、不允許寫時，核對交易被拒。
9. 模擬擁有者限定規則拒絕其他 UID。
10. 同 SDK 的 root update 與葉節點交易不能視為彼此獨立；可能中止或按 SDK 排序完成。
11. 日期與歷史 XP 保持原值。
12. REST ETag 過期基準被拒絕。

另有 6 項純決策模型測試：快取不能結案；相同 UID／epoch／操作代次；true-false-true；舊意圖缺少 metadata；同 UID 整包 localStorage 競爭會遺失項目；Boolean ABA 無法證明沒有其他編輯。後兩項是**風險重現通過，不是問題已解決**。此模型未接入產品。

## Rules 與仍不能證明的事

Repository 沒有可供本輪核對的正式 Rules 原始檔／已發布匯出。本輪沒有讀取正式資料庫或假冒已核對正式 Rules。先前使用者回報的根節點同 UID 讀寫規則，邏輯上可涵蓋葉節點交易；仍不能取代目前資料庫實例、發布狀態與規則版本的確認。

尚未證明：正式 Rules 相容性、正式網路／認證、Cloud Functions／外部觸發器是否執行、正式流量／計費、真正兩個瀏覽器分頁的調度、所有跨裝置 interleaving、現有已排入 SDK 的舊 update 能否安全取消。Emulator 不足以證明以上事項。

不改值交易仍是寫入請求；「沒有 value 變更事件」不能推論沒有觸發器／成本。不要為核對而在 root 做交易。

## B2 最小候選與前提

1. 先分離每個路徑的 queued／in-flight／awaiting-proof／needs-choice；不把網路錯誤當資料衝突。
2. 追蹤原 SDK Promise；原 flight 未完成時不加送核對或重試寫入。
3. 核對取得有效伺服器證據，且當前 UID、epoch、操作 generation、目標值皆相同，原 flight 已妥善處理，才可結束該**當前**意圖。不能只比較 Boolean。現有純值 pending 缺少這些欄位，尚未滿足條件。
4. legacy pending 必須有獨立、可保留且可回退的本機 metadata 方案；不可從快照或現在時間捏造舊操作身分。不得自動遷移／清空舊 pending。
5. 核對不同、規則拒絕、逾時、交易中止、工作階段失效：保留 pending；能重試的錯誤退避重試，其餘給明確可操作提示。
6. 同 UID 多分頁須先完成鎖定／協調及 durable pending 的競爭驗證；單一 JSON map 不是原子佇列。未證明前，不啟用跨分頁自動清理。
7. 完成狀態的核對不發出 `study-completed`，不補日期、不觸發 XP、不改 Design A；日期繼續使用原本獨立版本交易。
8. 伺服器相同代表「目標狀態在核對時已成立」，不能宣稱歷史那次寫入一定成功，也不能保證未來沒有其他裝置變更。

建議先選定 server-only 核對方式與必要的本機意圖代次方案，再授權 B2；目前不能直接啟用 no-op transaction 自動結案。

回退：停止新增核對排程，保留所有 pending／metadata，恢復人工處理；不自動回滾已完成的伺服器寫入、不清空 SDK 佇列或 pending、不補發 XP。

## 重現

一般決策模型（無網路）：

```sh
node --test tests/sync-b1/reconcile-model.test.mjs
```

Emulator 研究需 Java、本機 4.11.2 Database Emulator JAR，以及獨立目錄內 Firebase 9.22.0 的 `firebase-app-compat.js`、`firebase-database-compat.js`；不需 Admin SDK、真正帳號或憑證。JAR 與 SDK 不隨 PR 重複提交。

```sh
java -Xmx256m -jar /path/to/firebase-database-emulator-v4.11.2.jar --host 127.0.0.1 --port 9199
FIREBASE_SDK_DIR=/path/to/firebase-9.22.0 B1_REPORT=/tmp/b1-results.json node tests/sync-b1/sdk-emulator.mjs
```

腳本只允許 `http://127.0.0.1`，使用固定 `demo-becoming-sync-b1` namespace；會覆寫該本機 demo namespace 的合成資料與測試 Rules，不可指向有保存價值的 Emulator 資料。測試用 `Bearer owner` 僅是 Emulator 管理標記，並非正式憑證。

參考：[9.22.0 Repo 原始碼](https://github.com/firebase/firebase-js-sdk/blob/firebase%409.22.0/packages/database/src/core/Repo.ts)、[Transaction](https://github.com/firebase/firebase-js-sdk/blob/firebase%409.22.0/packages/database/src/api/Transaction.ts)、[PersistentConnection 重送流程](https://github.com/firebase/firebase-js-sdk/blob/firebase%409.22.0/packages/database/src/core/PersistentConnection.ts)。
