> 本輪新增：[內建重置與最短 Spark 首次切換](SELF_SERVICE_RESET.md)。使用者確認後由 Rules 受限地原子輪換 fence；舊受管工具不再是首次上線的必要前置。以下保留原流程與歷史限制。

# PR #26 正式切換操作清單（準備完成，不是執行授權）

適用基準：已審查 `12f56cece9ac95a2a566b2e4865eef88cff28556` 及本輪離線準備變更。課程同步核心、七組 Store、候選 Rules 契約不變。細節見 [LIFE_ISOLATION.md](LIFE_ISOLATION.md) 與 [RESET_PLAN.md](RESET_PLAN.md)。本文件不是可直接執行的 shell script，以下每關需留下證據；未滿足就停止。

## 已知事實及證據邊界

- 使用者提供的 Console 觀察：正式 Rules 是指定 owner UID 的 root-level 讀寫；舊結構匯出含 physiology、pharmacology、videos、questOS、habits、custom_events、checklist，沒有 learningV3／lifeControl／lifeV1。未取得原始完整檔案供獨立驗證，不推論未列出的根一定不存在，不把此描述當已驗證備份或 UID 歸屬。
- 最近一次 Codex 唯讀核對：Firebase project `my-exam-1aab9`、instance `my-exam-1aab9-default-rtdb`，正式公開 owner 設定與 `owner-config.js` 相同。Rules GET 403、資料 GET 401，沒有 Firebase 管理身分；不重試未授權存取，不以 SDK 快取作 server 證據。
- Vercel team `team_OncahZa34WFeSvYfJVYpn82t`、project `prj_GpatjsrrObLmUUXmocuJTvPpfINU`；Production alias `med-exam-dashboard.vercel.app` 指向 `dpl_ZN514Zy33qCBNRnPi72inEUjoa9f`，main `faf357ceab5752c4399bd6712c68a9ad2b1c2587`、READY／PROMOTED。Node 24.x、output `.`、build/install/rootDirectory 為 null。執行前必須重新確認，不能沿用時間較早的 metadata。
- Git integration 的 Production branch 是 main，auto-assign 開啟。候選 Rules 不會因網站 Push 自動發布；Repository 無 Firebase deploy 設定。不能先 merge main 讓網站早於 Rules 上線。
- 使用者希望未來放棄舊紀錄，但**尚未授權執行重置或部署**。本輪只有合成資料測試，沒有正式網路資料變更。

## 兩份獨立授權

**部署授權**：明確核准 exact Head、project／instance／UID、Rules hashes、freeze／active Rules 切換、網站切換與最小 smoke 操作。這不授權放棄資料。

**帳號重置授權**：另行核准空白開始、經歸屬核對的 legacy paths／XP、精確 UID 本機 keys、兩個新 generation／era 及初始化 patch hash。即使舊值留在備份或退役根，改用空白來源也屬實質放棄現有紀錄，不能當一般部署自動執行。現有情境沒有 canonical／control，且不做歷史遷移；缺此授權只能停在準備階段，不得建立空白新來源。

## 操作清單

| 關卡 | 順序與必留證據／停止條件 |
|---|---|
| 1 正式環境重新確認 | 唯讀確認 team、project、Production deployment／SHA、Firebase project／instance、Auth owner UID 與所有 shared children 歸屬；取得實際 Rules 原文及 hash，比較 root／ancestor grants 與完整候選。檢查是否已有 canonical／control；若與本輪觀察不同，停止並重做初始化審查，不覆寫現有新紀錄。需要 instance Rules／資料讀取與必要 Auth UID 查核權限；不索取帳號密鑰。 |
| 2 完整備份與驗證 | 從正式伺服器或管理 Console 取得**整個 instance JSON**及獨立 Rules 原文，記錄 instance、匯出時間、UID、位元組數及 SHA-256。驗 JSON 可解析、根／各子路徑數量與 server 證據相符，隔離 Emulator 還原後比對正規化全樹；另備份該 UID 本機 keys，不能把本機檔當 server backup。離線 `verifyResetBackup` 只驗 scoped artifact／hash，不能證明原始匯出完整、最新或屬於該 UID。 |
| 3 暫停正式資料寫入 | 在已核准維護窗，先提供維護入口，安裝 owner 綁定、經審查的 freeze Rules，完全移除舊 root grant，不與舊規則疊加。確認一般 owner、舊 shared writer 及新版 bucket 寫入都被拒絕。不得以刷新／登出／Service Worker 當凍結。此關屬部署授權中的正式變更。 |
| 4 最終 frozen snapshot | 確認 freeze 已生效後，再匯出整個 server JSON 與 Rules、產生 hash 並驗證還原。第 2 關快照不能代替這份。比對其他 UID、Auth 與課程定義；列出未知／未定 pending。未來初始化只能由這份 frozen snapshot 產生計畫。 |
| 5 初始化新版資料 | **部署及獨立重置授權都齊全才可執行。** 用 `createBlankAccountPlan` 離線產生 exact patch，人工／程式核對 UID、legacy 歸屬、全新且永不重用的兩個 generation、era、backup／patch hashes。已授權管理身分在同一次原子 multi-location update 建立空白 learningV3、lifeControl，並處理已核准 legacy roots，包含仍被讀取的歷史 XP days／awards；絕不能逐步刪 fence。`lifeV1/<generation>` 空節點在 RTDB 不存在是正常結果。只處理列明 paths；Auth、其他 UID、course definitions 不在 patch 中。套用後用管理端 server read 比對 patch 效果及 untouched scope。不把離線 helper 當正式 apply 工具。 |
| 6 安裝正式安全 Rules | 核對 owner 與 hashes，安裝**完整 active 候選**，保持舊四科、日期、v2、七組 shared roots 及歷史 XP 永久 deny 寫；只有 owner／UID／當前 generation 的新路徑可用。控制節點管理端唯寫。不能保留任何較高層 root grant。Rules 必須先於新網站開放；資料尚未準備好就維持 freeze。 |
| 7 切換新版網站 | 使用已審查 Head 的相同生產設定 build，核對不可變 deployment ID 與 commit，確認 Rules／control 已就緒才指派正式 alias。任何 staging deployment 也需要部署授權；本輪沒有建立。Preview promotion 可能重建，不能宣稱為已測的同一個 production artifact。 |
| 8 登入／同步驗收 | 在授權範圍內自動核對 Auth UID、control／course generation、空白日期／課程、0 歷史 XP、初始王國、固定課程目錄及其他 UID 不變。另須部署授權明列 synthetic/真實最小 smoke 範圍：課程勾選、日期、任務／習慣、reload／離線重連、多 context、server UUID／clock／pending；讀取成功不能代替寫入證明。新課程／任務依既有產品契約不發 XP，王國依真實課程／活動成長；不能把 XP 維持 0 當失敗。真實 OAuth／手機持久性需要正式驗收，不以模擬 Auth 代替。 |
| 9 失敗安全停止／復原 | 立即回到已審查 freeze Rules、維護／唯讀狀態，保存 server snapshot、Rules hash、pending／journal 與錯誤證據。不得清 pending、倒退 generation／era、恢復舊 root grant 或開回退役 roots。唯讀查明原因，待修復授權後重試。 |

## 復原能力與限制

目前**沒有已獨立驗證、相容新資料契約的前一版回復 build**；main `faf357c` 依舊契約寫入，不能作為可寫 rollback。預設安全停止方案是保持 freeze、維護入口，不開放正常編輯；可保留現有網站供唯讀觀察，但不能宣稱它能正常同步。正式切換前需預備並驗證維護入口；它尚未被部署。

若日後有同一新契約的已測 build，可在保持退役路徑 deny 的前提下切回，保留切換後成功資料。備份還原必須另行授權：先 freeze、保全最新成功紀錄，不能把較舊全庫備份直接蓋回，也不能重用 generation。若要重新空白開始，須再次核准 reset，原子輪換 lifeControl 與 learningV3 generation／era。沒有安全合併證據時就維持維護，不冒險還原。

## 候選 Rules 的既有邊界

- 以完整替換消除 ancestor grants；課程 Boolean／版本／clock 原子契約與首次日期 tombstones 不變。115 項 allowlist、批次、跨 UID、子路徑與 freeze 防護已有 Emulator 測試，本輪不重審同步核心。
- Rules 不能證明是 transaction 呼叫、驗證 UUID 在全歷史未曾用過，或阻止已授權 owner 提交結構合法的新操作。相同日期＋新版本／clock 的合法再次操作仍允許。需要防惡意 owner 的更強契約仍須 server writer，不是本輪部署準備範圍。
- 七組隔離已在程式及候選 Rules 完成；不再把 shared writer 當尚待開發項目。但未安裝正式 Rules 前，舊 root grant 仍是正式切換阻擋。

合成七根 JSON 的實際 Emulator 全樹還原與 null／陣列正規化演練見 [RESTORE_DRILL.md](RESTORE_DRILL.md)。它不代替第 2／4 關的真實完整匯出驗證，也不授權正式整根清空或還原。

## 本輪證據與剩餘阻擋

`createBlankAccountPlan` 僅產生 `executable:false` artifact，沒有 SDK、Auth、網路或 apply 能力。直接單元測試與 loopback Emulator 的 `--blank-only` 驗證空白初始化、freeze、其他 UID／靜態資料、實際登入流程（合成 Auth）、課程／日期／任務／習慣、XP 與王國；完整回歸由最終 Head CI 執行。結果連結以 PR 描述為準。

正式部署執行仍 NO-GO：原始 live Rules／完整 frozen backup／ownership 尚未獨立驗證，沒有正式管理執行權限、兩份授權、production smoke 或相容 rollback build。可以提交**部署授權審查**；審查須把上述關卡與獨立 reset 決策列為前置條件，不能直接開始部署。真實重置不因 CI 綠燈自動獲准。

## 維護模式 artifact（已準備，未部署）

`src/ui/maintenance-config.js` 的 `maintenanceEnabled` 預設 **false**。在獨立審查的維護 artifact 中改為 true，`firebase-entry.js` 會先顯示維護畫面，**不 import Auth、account-storage、runtime、sync 或 workspace**，不建立課程／生活 writer，也不回退本機學習模式。即使網址帶 `?mode=local` 仍受同一維護 gate 控制。既有 Auth persistence／pending 不刪、不宣稱已保存。

啟用方式（未取得 Preview／Production 部署授權前只做隔離驗證）：

1. 隔離工作目錄使用此 Head 的 artifact，只將 `maintenance-config.js` 設為 true，保留其餘設定／Rules hashes；以現有 `node server.js` 在 loopback 提供網站。不得使用 `.growth-review` 的 `review-start.js` 作維護驗證，該入口是專用 RAM fixture，不是正式 bootstrap。
2. 局部 `npx playwright test tests/browser/maintenance.spec.js` 會在真正入口以本機路由回傳 enabled config，驗手機／桌面、cloud／local、reload、零 Storage／IndexedDB 修改、無 Firebase 初始化與 writer 模組請求、原 Auth／pending／session keys 不變，以及切回 disabled artifact 後完整 reload 才恢復正常既有 local flow。不連線真實 Firebase；模擬維護 config 僅存在測試攔截，不是產品 URL 開關。
3. 取得**另行明確 Preview 授權**後，才可建立獨立維護 Preview，檢查 immutable deployment ID／Head／config=true、維護畫面、無編輯控制項／writer 初始化，並核對 network/storage。現有 Git integration 本來 Push 就會建立 Preview；本分支在 `vercel.json` 明列 `fix/durable-course-sync: false`，本輪 Push 不授權任何自動 Preview。另一條已停用的 review 分支保持不變，main 設定不更動；手動部署仍需授權。
4. 未來正式啟用仍依第 3／9 關先安裝並驗證 freeze Rules，再切換經驗證的維護 artifact。畫面會說明暫停使用、維護模式不會清除資料。靜態 catalog／外觀腳本與 SDK library 仍可能下載，但不初始化 Firebase Auth／DB、不啟動學習；這不是阻止所有頁面資源下載的開關。

安全停用：先完成 server 初始化與 active Rules／control／fence 驗收，再取得正常 artifact 切換授權，核對同一新同步契約與 config=false，切回後**完整 reload**。不在既有維護頁熱啟動，不讓使用者以 query 或 localStorage 繞過；既有 201 項產品回歸及正式 smoke 繼續適用。局部 disabled 測試只證明原 local flow 能恢復，真實 OAuth／server 寫入仍須授權的正式 smoke，不可混稱。

限制：這是新頁面的啟動阻擋，不能停止已開啟的舊分頁、繞過網站的舊程式或管理身分。**freeze Rules 仍是實際 server 保護**，不可用畫面或要求重新整理代替。維護 artifact 也不是可寫 rollback build；故障時保持 freeze／維護並保全資料，未核准前不恢復寫入。若 config/module 載入失敗，入口不會繼續初始化 writers；仍需監測畫面是否成功載入。

## 最終離線切換演練與正式執行入口

基準 `493734c7d297729d9f85dfebe14f344b48efb2aa`。`scripts/emulator-cutover.mjs` 是 **Emulator-only execution helper**，不是正式 apply 腳本；既有 runner 自建 loopback Java Emulator，再呼叫它。只接受 HTTP、明確 port 的 `127.0.0.1`／`[::1]` 與 `demo-*` namespace，拒絕正式 hostname、HTTPS、userinfo、額外 path/query/hash、非 demo namespace，HTTP 不跟隨 redirect。固定使用 Emulator 的合成 owner header，不讀入正式金鑰／Google credential。UID 僅接受 `fixture-*`。不要把 loopback 位址接到任何正式資料庫代理或 tunnel。

```sh
B2B1_EMULATOR_JAR="$PWD/work/firebase/database.jar" FIREBASE_SDK_DIR="$PWD/work/firebase" node tests/sync-queue/durable-course-emulator.mjs --cutover-only
```

沒有遠端 URL／credential／正式 apply 的 CLI 參數；直接執行 helper 檔不會變更資料。`createBlankAccountPlan` 仍固定 `executable:false`；只有上述受限的演練流程在可拋棄 Emulator 套用合成 patch。合成 snapshot 的 schema／歸屬可在測試中明確知道，不能把這份 test assertion 當真實 owner 證據。

成功順序：freeze 並讀回 Rules → frozen 全樹快照／hash／bytes → 在同一 Emulator 的**另一個 disposable namespace**驗證還原及全樹相等（不清空 source）→ 產生離線計畫並核對 source／patch hashes → 套用前再核對 source 未變 → 一次原子 PATCH 初始化 → 逐 leaf 比較整樹變更 → active Rules 並讀回確認 → 真正 Becoming 頁面合成 Auth 登入、課程首次日期、離線 pending／reload／server clock、生活保存。Rules hashes、完整合成 backup、plan 與 stage list 由 helper 回傳，固定標示 `productionExecutable:false`。

在 freeze、snapshot、restore、initialized、active、smoke 六點分別注入失敗：catch 只重新安裝 freeze，不回復舊 Rules 或舊資料；讀回確認後才回報 `stopped-frozen`。實際 owner SDK 對 legacy／新 bucket 都拒寫，其他 UID／靜態定義不變；smoke 後故障仍保留已成功的新資料。若連 freeze request／讀回都失敗，回報 **`freeze-unconfirmed`**，不得聲稱已安全。管理身分仍可越過 freeze，因此外部 admin 操作必須禁止並監測；初始化前 source 改變就停止，不自動重試 reset。stage list 只表示已確認的步驟；如果 PATCH 回應遺失，不可由 stage 名稱推論未提交，必須在 freeze 下讀 server 比對已核准 patch，保留未知結果而不重做初始化。

本機只跑直接 tool 單元與 `--cutover-only`；CI 預設保留原 82 組 Emulator 情境，加此成功／六點故障矩陣兩組（84）。URL／redirect／backup checksum／freeze-unconfirmed 另有直接單元測試。合成 Auth 不等於真實 OAuth／手機驗收；真實備份內容與 `.priority` 等未測 metadata 仍依 RESTORE_DRILL 的限制獨立驗證。

### 最短正式清單及人工關卡

1. **人工確認** owner Auth UID、legacy 每個刪除路徑歸屬、原始 Console 匯出／Rules 的來源及完整性；離線工具只能驗檔案與 hash，不能代替使用者確認歷史資料歸屬。
2. **人工分別授權** exact Head 的部署（含 freeze／active Rules／維護及正常網站切換／指定 smoke），以及該 UID 空白開始的獨立 reset（精確 paths／local keys、雙 generation／era、source／patch hashes）。未授權 reset，不可在部署中初始化空白來源。
3. 凍結前完整備份並在隔離環境還原 → 經授權 freeze → 驗證一般 writer 拒寫 → 取得並驗證最終 frozen server snapshot。
4. 從最終 snapshot 重新準備 artifact；**人工核准** backup／Rules／patch hashes 與 scope，固定維護、正常 build 的不可變 ID。任何 drift 都停止，不能拿本輪合成 artifact 套正式資料。
5. 已審查的一次性管理入口只套用核准的原子 patch，核對其他 UID／靜態資料與 fence；再 active Rules → 經授權切網站 → 指定最小正式 smoke。Codex 可自動比較技術證據，不需使用者逐項點選測試。
6. 任一失敗維持／重設 freeze 與既有維護入口；保留成功新資料與 pending，不倒退 fence、不開舊 root grant。不能確認 freeze 時立即停止所有後續步驟並請管理者核對。還原／再次 reset 須另一份明確授權。

### 最小權限與尚缺工具

最小可行正式方式：管理者現有 Firebase Console 負責 Rules／匯出，搭配**獨立受管 REST 執行器**，只做 frozen snapshot 核對、單次 root multi-location update、server 驗證及退出。不能用 Console 的整根 Import 覆蓋全庫來代替 atomic patch，也不能把 Emulator helper 換 URL 後當正式工具。

需要該 instance 的 Rules／全資料唯讀、經授權階段的 Rules 管理與資料原子寫入權限，以及 Auth UID 查核的唯讀能力；**不需要 Auth 建立／刪除／改密碼或整個專案 Owner**。資料管理身分通常越過 Rules，無法靠前端 Rules 將其限制為單一 UID，所以受管入口必須自己鎖 instance／UID／path allowlist／patch hash，留下操作記錄並於維護窗限制其他 admin。透過既有 Console 權限或短效受管身分提供，不在聊天貼金鑰，不建立長效 service-account key。

獨立受管執行器已提供，但正式信任設定／權限與執行授權**尚未配置／核准**；不提供任意 reset 的通用腳本。這是正式操作入口及授權前提，不能宣稱已可直接切換。現有同步／隔離核心本輪沒有改動，沒有發現需要重大重構的新增程式阻擋。既有維護 Preview 保持原狀，分支 Git 自動部署持續停用，本輪不部署任何 Preview／Production。

純離線正式操作 packet、現有 Owner 的短效身分用法、受管執行器操作及分階段停止／授權表，統一見 [MANAGED_ENTRY.md](MANAGED_ENTRY.md)。`managed-cutover-dry-run.mjs` 只有讀檔、差異與 hash 檢查，沒有正式寫入能力；正式 executor 預設停用，需獨立簽署及受管 ledger。使用者確認摘要與授權即可，不需手工修改複雜 JSON。

## 獨立受管執行器（預設停用）

已提供 `scripts/managed-cutover-executor.mjs`；正式入口不再只是設計，但**沒有正式操作授權**。`status`／`prepare`／`request` 純離線；`run-stage` 需 reviewed policy、乾淨不可變 Head、離線獨立簽章、限時 manifest 及 現有 Spark RTDB CAS 一次性 ledger。freeze、最終快照、一次性原子初始化、active Rules 各自核准執行，不包含網站部署。原 dry-run／Emulator-only helper 仍不可拿來寫正式環境。

Cloud Shell 權限、逐階段指令、備份 hash、未知結果停止及不可恢復舊 root grants 的完整規定見 [MANAGED_ENTRY.md](MANAGED_ENTRY.md)。正式信任設定與 短效 IAM／REST 尚未配置／線上驗證；只有 Emulator 成功不能解除這些關卡。初始化仍必須另有真實帳號重置授權。

NT$0 方案見 MANAGED_ENTRY.md：不建立 KMS／GCS 或計費資源。鎖存於 Owner 的 `cutoverAdmin/v1`，不得以舊備份覆蓋較新的鎖；整庫 Import 仍禁止。一般部署不包含資料重置，正式操作仍需另外授權。
