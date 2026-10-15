# B2-A：隔離 IndexedDB pending 佇列原型

基準 main：`30a46c0917170db01d6214cd2e112024b35ee5ab`，產品版號仍為 1.0.0。

**本原型未被任何產品入口載入。** 沒有 Firebase、REST、Auth 或 UI 接線，不讀寫 localStorage，不建立網路寫入，不搬移／刪除舊 `med_exam_pending_writes_v1`，不觸發 study-completed／日期／XP。資料庫名稱必須由測試者明確提供，且以 `becoming-b2a-prototype:` 開頭；不自動開啟任何資料庫。

## 資料結構與不變量

DB version 1，三個 object store：

| Store | Key | 目的 |
|---|---|---|
| intents | `[uid,path]` | 每個帳號／課程的當前意圖 |
| revisions | `[uid,path]` | 持久遞增 generation；意圖刪除後不歸零 |
| flights | `[uid,path,intentId,generation]` | 已宣告 in-flight、尚未結束的寫入標記；course／uid index 支援檢查 |

當前意圖：`uid`、`path`、`intentId`、`generation`、`target`、`state`、診斷時間；claim 成功後另含 `flightToken`。target 為 `{kind:'set',value:boolean}` 或 `{kind:'delete'}`；刪除不與 false 混同。state 為 queued／in-flight／awaiting-proof／needs-choice。

所有新增、代次更新、狀態轉換、flight 記錄與條件刪除，都在原生 IDB readwrite transaction 中執行；Promise 只在 transaction complete 後成功。多分頁的正確性依靠 IDB 的交易序列化，**沒有依賴 Web Locks 或 BroadcastChannel**。讀寫交易目前涵蓋三個 store，簡單且保守；未做高吞吐最佳化。

- generation 是該瀏覽器資料庫內的課程操作代次，不是伺服器版本，也不是跨裝置順序。
- intent ID 使用 crypto.randomUUID；時間只供診斷，不參與勝負／CAS。
- CAS 比對 UID、path、intentId、generation、預期 state；不只比較 Boolean。
- revisions 刻意保留，不提供自動清理／重設，以防刪除後 ABA。極限數字無法安全遞增時中止交易。
- 較新意圖可替換目前 intents 列，但不能抹除舊 flight。該路徑仍有未決 flight 時，不能宣告新的 in-flight 或移除當前意圖。

## API

```js
import {openPrototypeQueue} from '../../prototypes/sync-queue/indexeddb-queue.mjs';
const client=await openPrototypeQueue({name:'becoming-b2a-prototype:isolated-example'});
const a=client.bind('synthetic-uid'); // 未接 Auth；正式接線須只接受驗證過的 UID。
const queued=await a.put('physiology/fc_p_1_a',true);
const flight=await a.transition(queued,'in-flight');
// 本原型不會送出任何寫入。此處僅示範持久狀態契約。
// 真實證據必須由未來 B2-B 的受保護 Adapter 提供，不可憑 Boolean 自行宣告。
await a.settleOwnFlight(flight.flightToken,'acknowledged');
await a.removeIfCurrent(flight);
client.close();
```

| API | 結果與限制 |
|---|---|
| `bind(uid)` | 建立新的客戶端工作階段，舊 view 失效並中止該 client 尚在執行的交易。不是 Firebase 身分驗證或加密存取控制 |
| view.`put(path,boolOrNull)` | 原子遞增 revision 並寫入新意圖；null 代表刪除目標。舊 flight 不會移除 |
| view.`list()` | 只讀該 UID 的當前 intents |
| view.`unsettled()` | 只讀該 UID 的未決 flights；新意圖可能仍被舊 flight 阻擋 |
| view.`transition(expected,to)` | CAS 更新。queued→in-flight 會原子建立 flight，若已有 blocker 回 false |
| view.`removeIfCurrent(expected)` | 僅身分、代次、state 完全一致且該路徑無 flight 時刪指定列；否則回 false。保留 revision |
| view.`settleOwnFlight(flightToken,evidence)` | 僅原始 session、完全匹配的實際 flight 可刪除自己的標記；不接受 intent 快照、不刪較新的 intent。不替呼叫者驗證伺服器證據 |
| `unbind()`／`close()` | 使該 client 的舊 view／回呼失效，close 關閉 DB；不清空任何紀錄 |

合法轉換：queued→in-flight／needs-choice；in-flight→awaiting-proof／needs-choice；awaiting-proof→needs-choice；needs-choice→awaiting-proof。**沒有從未知狀態自動回 queued 的轉換。**

`settleOwnFlight` 的 evidence 只有 bounded 值 `acknowledged`／`proved-not-sent`，它是未來 Adapter 的契約，並不是本原型已驗證的伺服器收據。不得把它直接暴露成一般 UI／自動結案 API。即使 settle 成功，仍需另一次 CAS 才能刪 current intent；中間若出現新意圖，舊 callback 不會刪到它。

## Intent 與 flight 是不同契約（Code Review 修正）

先前 `transition()` 只更新 intents.state，而 flight 複製了 claim 當時的 state；`settleOwnFlight()` 卻用同一個含 state 的 matches，導致拿 awaiting-proof intent 結束原 flight 會失敗。已先用 Chromium 重現 settle=false，再新增完整 regression。

現在明確區分：

- `intents.state` 是可變的處理階段；CAS 刪除／transition 仍嚴格比對最新預期 state。
- `flights` 不保存 intents.state。它的 `phase:'unsettled'` 只表示物理寫入尚未結束；成功 settle 才刪除該 flight。
- claim 原子建立獨立 `flightId`、`ownerSession`，回傳型別為 `kind:'flight-token'` 的 `flightToken`。儲存列為 `kind:'flight'`，以免把 intent 或 flight 列誤當成 token。
- token 不可變，包含 UID、path、intentId、generation、flightId、ownerSession。settle 嚴格比對全部欄位、原 session 與 flight.phase；不是簡單移除原 state 條件。
- intent 進入 awaiting-proof／needs-choice 不應改變物理寫入身分。確認回呼持有原 token，即使 intent 已轉換階段仍可 settle。後續只能使用**最新 intent state** 做 CAS；原 in-flight 快照不能刪 awaiting-proof。
- 新意圖取代舊意圖時，原 token 只可結束原 flight；不能刪新意圖，也不能結束新 flight。重複、錯誤、過期 token 均不清理其他紀錄。

合法範例：

```js
const claimed=await a.transition(queued,'in-flight');
const awaiting=await a.transition(claimed,'awaiting-proof');
// 收到原寫入的合法確認後，沿用 claim 時捕捉的不可變 token。
await a.settleOwnFlight(claimed.flightToken,'acknowledged');
await a.removeIfCurrent(awaiting); // 仍需當前 state／intent 身分一致。
```

檢查六個合法轉換邊與代表性生命週期：直接確認、awaiting-proof 後確認、needs-choice 後確認、awaiting-proof→needs-choice→awaiting-proof 後確認均可結束。queued→needs-choice→awaiting-proof 若本來沒有物理寫入，不會捏造 flight；其刪除仍是呼叫端明確決策，不是已驗證的伺服器成功。

DB store/key schema 維持 version 1；本原型尚未合併／接線。先前手動使用的舊格式 prototype flight 沒有 typed token／flightId，不會猜測身分或自動遷移、刪除，仍會阻擋該路徑；測試使用獨立新 DB 與合成舊格式資料驗證此限制。這不涉及使用者 legacy localStorage pending。

## 失敗與恢復

- open 被拒／blocked／timeout／未知較新版 DB：明確失敗，不 fallback 到 localStorage。timeout 後若連線晚到，關閉它。
- put 是「建立新的使用者意圖」，不是網路重送 API。若呼叫端在提交邊界消失，重新開啟先讀 list／unsettled；不能盲目再 put 或重新 claim。條件刪除／settle 重試只會命中原始身分一次。
- Quota／Abort／其他儲存錯誤：交易回滾，回傳 bounded 錯誤；不能宣稱已保存。整筆 put 與 generation 同時成功或失敗。
- bind／unbind 中止舊 session 的進行中交易；若交易早已完成，其資料仍屬舊 UID。非同步結果不會被套用到新 UID。
- versionchange 關閉舊 client；不自動升級未知較新版本或丟棄資料。
- 重新開啟保留 queued／in-flight／awaiting-proof／needs-choice。**open 不自動重送、不重設 state、不清理 flight。**
- 進程在 claim 成功後、實際傳送前中斷，與已傳送但未收到確認不能靠本機辨別；新 session 不可替死掉的原 session 宣告 acknowledged／not-sent。原型會保持阻擋，未實作跨 session 的證據恢復政策。
- durable 請求採 IDB `durability:'strict'`；不支援或失敗時 fail closed。不宣稱能保護使用者清除網站資料、OS／硬碟毀損、瀏覽器儲存逐出或私密模式結束。

## 測試與重現

```sh
npm ci
node --test tests/sync-queue/contract.test.mjs
npx playwright install chromium
npx playwright test tests/browser/sync-queue.spec.js --reporter=line
npm run build
npm run lint
npm test
```

15 項 Node 契約／開啟失敗測試；21 項 Chromium 測試：不同路徑並行、同路徑代次、true-false-true、過期結果、state mismatch、刪除後代次、未決 flight、單次 settle、重啟保守恢復、UID 切換、活動交易中切帳、Quota／Abort、legacy 不接管、交易中關頁、versionchange、完整瀏覽器 profile 重啟。部分測試含多個斷言／情境，測試數依 runner 顯示。

- 開啟失敗以測試替身注入；Quota／Abort 在真實 IDB 交易上注入例外，不是真實磁碟填滿。
- 關頁途中只保證觀察到「交易全有或全無」，不假設使用者關頁必然發生在 commit 前。
- full restart 使用合成 Chromium profile；沒有真實帳號或 Firebase。
- legacy 測試使用獨立瀏覽器 context 的合成 localStorage；原型完全不接管它。不代表舊版分頁已能安全相容正式新佇列。
- 邊界測試確認產品入口不 import 原型，原型無 fetch／Firebase／localStorage 操作或事件派發。

CI 增加本原型的 Node／Chromium 測試，保留既有 regression。新增涵蓋 awaiting-proof 完整結案、跨分頁 state／settle 競爭、新 flight 與過期 token、原 session 失效、claim／settle 交易 abort 回滾及舊格式 prototype flight 保留。未改 package、依賴、版本或 Vercel 設定。

## 發布界線

Draft PR 使用目前已不存在、且 Repository 原有 `vercel.json` 明確停用部署的 `codex/growth-i1-integration` 分支名稱；從上述最新 main 重新建立。用途以本 PR 標題／本文件為準，不沿用已淘汰的 I3.2 架構。不會為此改動部署設定、手動部署或建立 Tag。
