# B2-B.2a：隔離 Facade 與原子持久保存契約

基準 main：`faf357ceab5752c4399bd6712c68a9ad2b1c2587`。本 PR 只做新操作的本機保存契約，不是正式同步切換、legacy 遷移或雲端發送授權。

## 隔離範圍與 API

- `persistence-store.mjs`：必須明確提供 `becoming-b2b2a-prototype:` 名稱、UID、epoch 及合成 context，不能開啟 B2-A 或正式資料庫。
- `course-facade.mjs`：供未來課程 UI／Planner／persist 入口共用的保存介面。沒有產品入口 import、Firebase、REST、Auth、localStorage 或事件派發。
- `saveCourses({requestId,source:'new-course-action',changes:[{path,value,dateHandoff?}]})`：單筆為長度 1；批次最多 500 筆。value 明確區分 Boolean 與 null 刪除。
- 成功 Promise 只在 IDB transaction `complete` 後回傳 `{kind:'local-commit',saved:true,sync:'held-group-contract',uid,batchId,requestId,members}`。不等待 SDK，也不宣稱雲端已確認。
- 失敗以 bounded code reject，不回傳成功 receipt。`createMockCourseUI` 使用 async/await catch；保留記憶體 draft 供明確重試，committed 不被樂觀 draft 取代。尚未保存的 draft 不保證重新整理後仍在，UI 不宣稱已保存。
- `saveNonCourse` 明確拒絕並要求未來獨立委派，不接管 checklist／habits／events。
- `describeLegacy` 只回傳不可發送、來源歸屬未驗證的待核對描述，不讀／寫任何儲存。`importLegacy` 禁用，legacy 不能建立日期交接。
- `inspect` 是同一 readonly transaction 的 UID 範圍 snapshot；`deliverDates` 只接受標示為 isolated-mock 的測試 sink，不能接正式日期服務。

## IndexedDB 原型 API 擴充

新增獨立的 persistence 擴充入口，保留 B2-A／B2-B.1 既有 API、store、版本及測試完全不變。這是避免舊單筆 Adapter 誤拆批次的隔離邊界，不是推薦產品同時維護兩套活動課程佇列。未來正式接線前必須選定唯一 schema／遷移方案。

四個 store：

| Store | key | 用途 |
|---|---|---|
| intents | UID＋path | 該課程最新意圖，含獨立 intent ID／generation／batchId／作者 session／epoch |
| revisions | UID＋path | 逐課程單調代次 |
| batches | UID＋requestId | 原始整批 members、batchId 與正規化內容；不是雲端 receipt |
| handoffs | UID＋handoffId | 已保存新動作的獨立日期交接，pending／accepted-by-mock |

所有批次 members、revisions、batch 與 handoff 在同一 strict-durability readwrite transaction 成功或回滾。任一 member 失敗不留下部分新增，也不破壞原先已保存意圖。

- 同批重複 path：**整批拒絕**，不採隱含 last-wins。
- 排序採固定字元順序，重試不依賴瀏覽器 locale。
- 同 UID 同 requestId、相同內容：回傳原 receipt，不增加代次／交接；不同內容拒絕 `persistence/request-id-reused`。
- 多分頁以 IDB transaction 序列化；同路徑每次新 request 增加 generation，true→false→true 不共用身分。
- 每批原始 members 保留，最新 intents 可被新批次取代；舊 batch receipt 不代表那些 members 仍是目前最新，也不能拿來送出子集合。
- UID／epoch／signedOut 變化使舊交易失效；切換帳號不會清除舊 UID 資料。
- 若 transaction 已提交後工作階段才失效，呼叫者可能收到 stale-session；重新登入原 UID 必須用原 requestId 查證／重試，不能假定未保存而建立新 ID。
- strict durability 不是 OS 斷電／瀏覽器逐出的保證；本機資料未備份前不承諾跨裝置或永久保存。

## Firebase 批次語意研究與 group flight 契約

現有正式 `sync.js` 使用一次 root `update(sent)` 的原 Promise。RTDB multi-location update 具全批成功／失敗語意；不能將一個章節或課程型任務默默改為多個獨立 set。Node 測試以故障模型重現「第二個獨立寫入失敗後，第一個已成功」；這是模型，不是新的正式 Firebase 或 Emulator 原子性驗證。

本候選 **沒有任何雲端 writer／claim／group flight**；所有 intents 都是 `held-group-contract`，不是 B2-B.1 可發送的 queued。未來需要：

1. 同一 IDB transaction 核對整組目前 members，檢查每個 path 無未知 blocker，再原子建立 immutable group token 與逐 member flight。部分 member 已被取代時必須停下／重建經核准的群組，不得靜默略過。
2. group token 包含 UID、sender session、epoch、group flight ID、batch ID、完整 path／intent ID／generation／target 集合。token 的 members 不隨畫面狀態改動。
3. claim commit 後呼叫**一次** SDK root update，原 Promise 綁定整組 token；不能用單一 member 的成功或幾個獨立 Promise 的部分成功充當 group 確認。
4. 成功後原子解除整組原 flights，逐 member 只 CAS 結束仍匹配的最新意圖。新 generation 不受舊組確認影響；本機結案失敗只重試本機。
5. group Promise rejection、claim→SDK 呼叫之間崩潰、owner 消失：整組保留未知 blocker，不推定全未寫入、不重送。

這些是 B2-B.2b 的待實作／驗收契約，不是本 PR 已提供的安全保證。參考 Firebase 官方 [multi-location update](https://firebase.google.com/docs/database/web/read-and-write#update_specific_fields)。

## 首次日期交接

只有呼叫端明確傳入「新動作」、value=true、`dateHandoff:{eligible:true,day:'YYYY-MM-DD'}` 時，才在同一交易建立 handoff。驗證日期格式與日曆有效性，但**不自行實作正式 eligibility／firstOnly 業務判定**，也不從 legacy／伺服器同值推算首次日期。

handoff 具有穩定 UID／handoffId／intent ID／generation、原動作捕捉的 day，以及 firstOnly 提示。課程 receipt 成功不代表日期已處理；交接確認失敗不改成課程保存失敗。

Mock sink 必須先按 UID／handoffId 持久去重，再回傳 `mock-date-accepted` receipt；Facade 才可在另一 IDB transaction 標記 accepted。測試使用另一個真 IDB receipt store：接受成功但本機 ack abort 後重試，只產生一個 Mock 接受紀錄，不派發 study-completed、不觸發 XP。

**正式接線阻擋**：現有 `course-dates.js.set()` 沒有持久接受 receipt，不能將它的 return void、記憶體 firstOnly 提前返回或 onChange 視為可靠接受。本 PR 未修改該檔，也未證明真日期服務跨崩潰去重／保存失敗恢復。正式橋接需重用原有 firstOnly、版本交易、移除標記與歷史 award 判定；尚未證明前禁止啟用真 sink。

## 驗證與限制

- Node 8 項；Chromium persistence 18 項；原 B2-A Node 15／Chromium 21、B2-B.1 Node 14／Chromium 16 維持通過。
- 單筆、整批 rollback、替換已保存資料後 rollback、重複 request、多分頁同／不同課程、ABA、UID／epoch、close、關頁、Quota／Abort、四種 Mock UI 入口、日期接受與 ack 分離均有測試。
- Quota／Abort 是 native IDB 上故障注入；未測實際磁碟滿、OS 斷電、Safari 實機、正式 Auth／Firebase。既有 SDK Emulator 回歸由 CI 保留，但不是新 group flight 的驗證。
- 日期 eligibility 及 sink receipt 來源目前是可信 Mock 測試契約，不能直接信任任意產品呼叫者。batches／handoffs 本輪不清理，不宣稱具備長期容量策略。
- 無 migration journal、legacy 接管、REST 核對、自動結案、雲端批次發送或產品 UI 接線。

重現：

```sh
npm ci
node --test tests/sync-queue/persistence.test.mjs
npx playwright install chromium
npx playwright test tests/browser/sync-queue.spec.js tests/browser/write-adapter.spec.js tests/browser/persistence-facade.spec.js --reporter=line
```

停用／回退：本原型沒有產品接線；保留測試 DB 即可，不刪資料。未來不得因移除 prototype schema 而把已保存群組改交單筆 Adapter 重播，也不得補日期、XP 或清除 legacy。
