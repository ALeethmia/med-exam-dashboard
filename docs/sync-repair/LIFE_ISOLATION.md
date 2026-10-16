# 七組生活資料隔離（PR #26）

基準 `ef4c77618c44e30a9e10d559dc8fffadb8267408`。只加入七組 DB／storage facade、登入時的 generation 綁定及候選 Rules；課程同步核心沒有修改。沒有部署、真實資料讀寫或遷移；以下均為合成帳號測試。

| 原 Store 路徑 | 新位置（前綴 `users/<UID>/lifeV1/<generation>/`） |
|---|---|
| habits | habits |
| questOS/v1/training | training |
| questOS/v1/adaptiveStudy/settings | adaptiveStudy/settings |
| gamification/v2/timeTasks | timeTasks |
| gamification/v3/planner/tasks | planner/tasks |
| custom_events | custom_events |
| checklist | checklist |

`users/<UID>/lifeControl` 是管理端唯寫的 `{schema:1,generation,era}`。一般客戶端不能建立、修改、刪除 control，不能以 ancestor 寫入取代 control 或整個 namespace。各 bucket 的 Rules 核對 owner、UID、目前 generation；七個舊 shared 路徑永久拒讀寫，歷史 XP v1 帳本繼續唯讀。root／UID／generation 祖先沒有 write grant。缺少 control 時不啟動資料介面，不自行建立 generation 或回到舊路徑。

`auth.js` 啟動前訂閱 control，每個 session 只綁一次。control generation／era 改變時，舊 session 立即失效、停止寫入並重新載入；不在原 session 換路徑重送 pending。相同 UID 的重複 Auth 通知不會使有效綁定失效。冷啟動等待 control 超過 readiness 時限後，連線恢復收到 control 會重新開始 readiness，不依賴人工清 pending。SDK control 快取與連線狀態不是保存證明；真正提交仍由 server Rules 的當前 generation 決定。

本機仍先依 UID 隔離；七組 pending／快取使用額外 `life_v1:<generation>:` 前綴，包含 legacy habits bridge、aggregate pending 及歷史 XP 本機快取。舊 unversioned keys 和舊 generation 原樣保留，不匯入、不重送、不刪除。storage event 僅轉送目前 UID／generation；課程 journal、課程日期與課程快取鍵保留既有 UID 路徑。quota／儲存失敗會拋錯、使 life binding 不可寫並進入既有 error gate，不能把 RAM 變更宣稱已保存；reload 只恢復已持久化資料。

## 驗證範圍

- 直接 unit：UID／generation key 與事件隔離、七組 wire path、mixed batch／ancestor 逃逸、失效 updater／late ACK、control 驗證、本機 quota；並跑原 Planner／Life／Adaptive／Sync guard 測試。
- 真正 Becoming 頁面與固定 SDK／Emulator：七組實際保存，任務／訓練／容量／日曆／習慣／清單由原 UI／handler 操作；原時間任務 Store API 另行驗證。
- 離線在七組建立 pending → 管理端合成輪換 control → 新分頁建立新進度 → 舊分頁重連／reload、帶舊儲存重新登入；舊內容不能寫進新 generation，原 pending keys 保留。
- 七個舊 generation set／transaction、混合 old＋current multi-update 共 15 次全部拒絕，且整個合成 DB before/after 相等。另驗 control、UID 與 ancestor 拒絕。
- quota 操作不出現在 server，session 停寫，reload 後沒有失敗的任務；新 generation 七組仍可正常保存，其他 UID、課程與 XP 不變。
- CI 預設跑原課程安全測試與新增生活隔離測試，另跑完整瀏覽器回歸。`--life-only` 只供本機局部 SDK Emulator 迭代；CI 不帶此參數，不 skip 安全測試。

既有 UI mocks 的七組邏輯紀錄由 test-only `life-fixture.js` adapter 對應新協定，保留原先產品行為斷言；它不是 Rules 驗證。SDK Emulator 不使用這個 adapter，直接檢查實際 UID／generation 路徑與拒絕結果。沒有為取得綠燈改用 legacy fallback。

## 未來切換／重置前提

1. 仍須取得並核對正式 Rules、精確 UID 歸屬、部署／初始化授權；本輪不操作正式系統。
2. freeze 後備份 legacy scope、該 UID 的 learningV3、lifeControl、lifeV1 與全部 UID local keys，驗 checksum。備份工具仍 `executable:false`，不提供 reset API。
3. 使用者已選擇未來放棄舊歷史，不需搬移七組資料。管理端初始化新的唯一 life generation／era，再啟用經審查的完整候選 Rules，最後切換網站。不能先上網站而讓客戶端猜 generation。
4. 真正全帳號 reset 必須在**同一次管理端原子操作**輪換 lifeControl（全新、永不重用的 generation，遞增 era）與課程既有 generation／era fence，不能刪掉 control 或還原成初始 generation。舊 generation 的資料可留作備份，但一般客戶端永遠不能再寫。普通客戶端沒有重置權限。
5. 仍需正式 smoke、備份／復原演練及該 UID 的獨立明確重置授權。Rules 只驗證 namespace／權限，不能辨認 owner 的任意合法外觀新操作；前輪所述更強威脅模型不因本輪改變。

七組程式與候選 Rules 隔離完成，不代表正式 Rules 已生效或已獲准真實 reset。保持 Draft 供再次 Code Review，不能自行 Merge／部署／重置。

本輪本機結果：229 項 Node 全部通過；直接相關 SDK Emulator `--life-only` 14/14（13 組生活隔離情境＋既有 XP／課程不變檢查）通過；build／lint 通過。完整瀏覽器未在本機執行，交由最終 Head CI；CI 同時執行不帶 selector 的全部 78 組 SDK Emulator 場景。最終結果與連結記錄在 PR 描述，保持 Draft 等待 Code Review。

首次 CI browser 結果為 200 passed／1 failed：登入測試把 DB handle 取得次數固定為一次，新增 control 讀取後合法流程是兩次。只更新該計數並增加實際 UID／generation 綁定斷言；登入前零存取、拒絕帳號、登出與保留原紀錄驗證均保留。僅局部重跑這一項，1 passed；最終完整結果由後續 CI 確認。

第二輪 CI：完整 browser 201/201 與完整 SDK Emulator 78/78 通過；最後 Auth／Fixtures step 的 host mock 漏攔截新 test adapter，導致啟動逾時。補齊該 fixture module route，未變更產品程式或弱化斷言；Auth bridge 原 6 項檢查局部重測通過，其餘同 step 驗證另行局部重測，最終 CI 結果見 PR。
