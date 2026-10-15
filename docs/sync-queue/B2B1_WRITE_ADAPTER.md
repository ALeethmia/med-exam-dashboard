# B2-B.1：原 SDK Promise 寫入 Adapter（隔離原型）

基準 main：`a61cd59e4990204ad6533f4efae502041652885f`。本候選沒有產品入口接線、正式 Auth／Firebase 接線、legacy 接管或自動核對結案。不得直接放入 Production 同步流程。

## 最小契約

`createWriteAdapter({queue,uid,epoch,context,write,intervalMs})`；queue 為 B2-A client，context 為合成生命週期讀取函式，write 為注入的 `(path,target) => 原 SDK Promise`。context 回傳 `{uid,epoch,status}`，不是憑證；Emulator harness 才使用 SDK，Adapter 不匯入 Firebase。

API：`enqueue(path,booleanOrNull)`、`pump()`、`inspect()`、`status()`、`close()`。

- `enqueue` 的成功只表示 IDB 意圖 transaction 已 commit，不表示雲端已同步。保存失敗會 reject。
- `pump` 為 single-flight 排程，不是 Firebase 寫入成功 Promise；本機交易錯誤以 `lastError` 呈現。預設每秒輪詢，intervalMs=0 僅供手動驅動測試。
- `inspect` 回傳 intents、flights 和 `delivery`；它的分開讀取只是診斷，不作為原子授權證據。未知 blocker 明確標記，不默默忽略新 intent。
- B2-A 唯一變更：`put(path,value,{epoch=null})` 可記錄新意圖作者的 `ownerSession`／epoch；原呼叫相容。epoch 是本機工作階段，不是伺服器版本。由其他分頁發送時，以該 sender 的 session／epoch 與新 flight 綁定，不假冒作者。
- Adapter 擁有其 queue client 的一個 session；不要讓其他功能共享該 client 綁定生命週期。舊 Adapter 失效時不會 unbind 已換綁的新 session。

## 傳送與結案

1. IDB `put` commit 後成為 queued。
2. 僅 ready 且目前 UID／epoch 有效時 claim；transaction commit 才得到 immutable flight token。
3. 記憶體中將 `started=true` 設在 writer 呼叫前。每個 flight 最多呼叫一次注入 writer；SDK 自己的協定重試不算應用層第二次呼叫。
4. 立即將原 Promise 的成功／失敗 callback 綁定 token 及目前 Adapter session。永遠不根據 Boolean 清除新操作。
5. SDK 成功：標為 `ack-local-pending`，只透過原 token settle 原 flight；再找相同 UID/path/intent ID/generation 的最新 row，以其最新 state 做 CAS。
6. 本機 settle 或 intent 刪除交易失敗，保留記憶體成功證據，後續 pump **只重試本機結案**。不再呼叫 writer。若成功證據隨崩潰消失，採未知恢復，不假裝已確認。
7. 舊 intent 被新操作取代時，原成功只能解除原 blocker。最新 queued intent 由任一合作分頁的輪詢繼續 claim；不要求使用者再操作。

IDB transaction 才是跨分頁正確性的核心。輪詢只保證存活分頁繼續排程；不依賴 BroadcastChannel 心跳或 Web Locks 判斷 owner 是否死亡。

## 明確的失敗分類

| 類別 | 持久／記憶體證據 | 行為 |
|---|---|---|
| 尚未送出 | queued，無 claim | 等 ready；可正常排程 |
| 本 session 已 claim、尚未呼叫 SDK | `claimed-unsent`＋持有原 token | 同 session 可等待 ready；若已被新意圖取代，只解除可證明未送出的原 blocker |
| claim 後崩潰 | 持久 flight，但原 session／控制流已失去 | **unknown**，不以「測試知道呼叫次數為 0」當恢復證據 |
| SDK 進行中 | `sdk-pending`＋原 Promise | 不重送，重連等原 Promise |
| 已確認、尚未本機結案 | `ack-local-pending` | 重試 IDB，不重送 Firebase |
| Promise rejection／同步 throw／非 Promise 回傳 | `rejected-unknown`，保留 flight | 目前 intent 能匹配時轉 needs-choice；不推定伺服器必然未寫入 |
| UID／epoch／session 失效 | `active=false` | 中止本機交易與後續處理；不取消或倒寫已送至 SDK 的資料 |
| 重啟／其他 session 的未知 flight | `blocked-by-unknown-flight`／needs-recovery | 保留 blocker 與最新 intent，等待未來恢復政策 |

權限拒絕與模擬網路 rejection 均保守保留 blocker；本階段不新增「安全拒絕證據分類」或跨 session 恢復 API。它們可能仍需人工處理，這是原型限制，不是永久自動同步已完成。

## 寫入生命週期驗證表

以下 SDK 次數是注入 writer 的呼叫次數；不是網路封包數。Browser 為 Chromium Mock＋真 IDB，Emulator 為真 9.22.0 SDK＋本機 4.11.2。表中的「新」指相同課程的最新 intent。

| 情境 | SDK 次數 | Flight 結果 | Intent／pending 結果 | 證據 |
|---|---:|---|---|---|
| false／明確刪除 | 各 1 | 各自確認 | false 不當成 null；刪除使用 null | Browser／Emulator |
| 正常成功 | 1 | 原 token 結案 | CAS 刪除，無 pending | Node／Browser／Emulator |
| loading／error 尚未送出 | 0；ready 後 1 | ready 前無 flight | 保留，ready 才處理 | Node／Browser |
| 已送出後重連／重複 pump | 1 | 等原 Promise | 確認後結案 | Node／Browser／Emulator |
| 兩分頁不同課程 | 共 2 | 各自獨立 | 兩者確認後清除 | Browser |
| 同課程 true→false→true | 原 1＋最新 1 | 原解除後才 claim 新 flight | 中間未送出的意圖被最新意圖取代；舊確認不刪新 | Node／Browser |
| 同 session 暫停於 claim 後 | 0；ready 後 1 | 使用原 claim，不重新 claim | 保留直到成功 | Node |
| claim 尚未發送但已被取代 | 原 0＋新 1 | 原 owner 以本地控制流證明未送出 | 新 intent 繼續 | Node |
| 成功後 flight delete abort | 1 | 回滾保留；重試本機解除 | 保留至本機完成 | Node／Browser |
| 成功後 intent delete abort | 1 | 已解除 | intent 保留；重試 CAS | Node／Browser |
| 權限拒絕 | 1 | unknown blocker | 保留 needs-choice；不自動重送 | Node／Browser／Emulator |
| 模擬網路 rejection | 1 | unknown blocker | 新 intent 也保留且標示阻擋 | Node／Browser |
| claim 後、SDK 前頁面重載 | 原 0；恢復 0 | unknown blocker | 保留；不猜測未送出 | Browser |
| SDK 後、確認前關頁 | 原 1；恢復 0 | unknown blocker | 保留 | Browser |
| 舊 Promise 延遲成功後切 UID／epoch／登出 | 原 1 | 舊回呼不解除 | 原 UID pending 保留 | Node／Browser |
| 同 UID 重新登入 | 舊 1；新 0 | 舊 session blocker | 原、新意圖不混用 | Browser |
| 首次日期／XP／legacy | 課程 1；日期／XP 0 | 僅課程 flight | 既有資料／legacy 原字串不變，無 study-completed | Browser／Emulator |

## 重現

```sh
npm ci
node --test tests/sync-queue/contract.test.mjs tests/sync-queue/write-adapter.test.mjs
npx playwright install chromium
npx playwright test tests/browser/sync-queue.spec.js tests/browser/write-adapter.spec.js --reporter=line
B2B1_EMULATOR_JAR=/path/to/firebase-database-emulator-v4.11.2.jar \
FIREBASE_SDK_DIR=/path/to/firebase-9.22.0 \
node tests/sync-queue/adapter-emulator.mjs
```

Emulator script 會驗證 JAR／SDK 的固定 SHA256，啟動自己擁有的 loopback emulator，僅寫入固定 `demo-becoming-b2b1` 合成 namespace，沒有接受正式 URL 的選項；CI 下載相同固定版本到暫存目錄。合成 owner token 不代表正式 Auth 驗證通過。腳本只在 emulator 寫測試 Rules，不改 Repository 或正式 Rules。

本輪結果：15 項既有 Node 契約＋14 項 Adapter Node、21 項既有 Chromium＋16 項 Adapter Chromium、5 項真 SDK Emulator 檢查通過。配額／abort 為故障注入。原生 Safari **未驗證**，也未以 WebKit 冒稱 Safari。未測真實帳號、正式 Firebase 或作業系統斷電。

## 停用與回退

未接線產品，所以不需正式資料回退。未來停用應先停止新 claim／writer 排程，保留 intents／revisions／flights；不得清空未知 flight、將它重設 queued、接管 legacy，或還原成盲目重播。SDK 已接受的寫入不能靠清本機資料取消。
