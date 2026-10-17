> 本輪新增：[內建重置與最短 Spark 首次切換](SELF_SERVICE_RESET.md)。使用者確認後由 Rules 受限地原子輪換 fence；舊受管工具不再是首次上線的必要前置。以下保留原流程與歷史限制。

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

## 正式切換與空白開始

唯一操作清單見 [CUTOVER.md](CUTOVER.md)；離線初始化／備份邊界見 [RESET_PLAN.md](RESET_PLAN.md)。七組隔離已完成，不再需要重新設計 shared writer。正式 root-level owner grant 尚未切換；使用者提供的 Console 觀察不能代替獨立驗證的 frozen server backup。

先核對／完整備份，再以正式授權 freeze、取得最終快照。空白初始化另外要求帳號重置授權，原子建立／輪換課程 fence 與 lifeControl，處理已確認歸屬的舊 XP 來源，先安裝完整 active Rules 才切網站。空白 lifeV1 generation 在 RTDB 讀為 null 是正常狀態，control 指向它、第一筆合法資料才建立實體節點。不以 client fallback、預設 generation 或猜測補齊。

目前沒有已驗證的新契約前版 rollback；失敗維持 freeze／維護，不能退回 main 舊 writer 或危險 root grant。保留所有成功紀錄與 pending 證據；restore／再次 reset 都需另行授權並防止 generation 重用。詳見操作清單第 9 關。

## 測試證據

已審查 Head `12f56cece9ac95a2a566b2e4865eef88cff28556` 的 CI：完整 browser 201/201、SDK Emulator 78/78、Auth／Fixtures 及 Node／build／lint 全部通過。七組本機局部 Emulator 14/14；包含 quota、舊 pending、重連、重新登入與跨 UID。測試 adapter 只用於既有 UI mocks，真正 SDK Emulator 直接驗實際路徑及 Rules。

後續空白初始化準備只新增離線計畫與合成驗證，保留原有安全測試；最終 Head 的結果及連結記錄在 PR 描述。七組隔離本身不執行部署或真實資料操作；後續獨立受管執行器預設停用，見 MANAGED_ENTRY.md。保持 Draft，等待 Code Review。
