# PR #26：Rules 安全審查與切換準備

本輪基準 `948ac6fc54e88b17c5ef8df1cfbcb7d1151ecc47`。只修改候選 Rules、測試、離線準備工具與文件；沒有改核心同步契約、正式 Rules、正式資料或網站部署。維持 Draft。

## 已核對的環境與未知項

- Repository 公開設定：Firebase project `my-exam-1aab9`，Realtime Database `https://my-exam-1aab9-default-rtdb.firebaseio.com`；owner 由 `owner-config.js` 固定，不接受首次登入者自動認領。
- 唯讀 Vercel API 與 GitHub deployment `7098904740` 核對：Production 為 `dpl_ZN514Zy33qCBNRnPi72inEUjoa9f`、READY、main `faf357ceab5752c4399bd6712c68a9ad2b1c2587`。正式 alias `med-exam-dashboard.vercel.app`；不可變部署 `med-exam-dashboard-diuv4h49g-peterlee0718-9156.vercel.app`。Vercel project `prj_GpatjsrrObLmUUXmocuJTvPpfINU`、team `team_OncahZa34WFeSvYfJVYpn82t`。這是本輪查詢時的觀察，實際執行前須重新比對。
- `vercel.json` 沒有部署本候選 Rules 的設定；GitHub Actions 只做測試，沒有 Firebase deploy step。沒有 `firebase.json` 或自動 Rules 發布入口。Push 此分支會觸發既有 Preview；不會由本輪工具觸發 Production。
- **正式 Rules 不在 Repository，這輪沒有讀取正式資料／Rules，也沒有可用的 Firebase 管理身分。** 因此無法聲稱實際正式 ancestor grants、資料完整性／歸屬或備份已驗證。README 以前的 owner-only root grant 只是範例，不能視為 live Rules，也不能再用作 v3 的發布方案。這是正式切換阻擋項，不可用候選測試 PASS 代替。

## 候選 Rules 的保證與邊界

`config/firebase/database.rules.candidate.json` 是完整替換候選，不能與舊 root grant 疊加。owner 留為 `__REVIEWED_OWNER_UID__`，不可原樣發布。`tests/fixtures/course-rules.json` 用相同 generator，僅把 owner 綁為合成 `fixture-A`。`database.rules.freeze.candidate.json` 保留相同讀取邊界，關閉所有一般客戶端寫入，可作未來維護／失敗凍結的候選。

1. root、`users`、`users/$uid`、`questOS`、`gamification` 等祖先沒有 write grant。canonical 僅 owner 且 `auth.uid === $uid` 可讀寫；匿名、其他 UID、集合祖先讀取均拒絕。
2. 四科舊 root、舊日期、v2 gate 永久拒寫；舊課程／日期也不再作讀取來源。混合合法／已淘汰路徑的 root multi-update 全部失敗，其他分支不會部分寫入。
3. 每次 Boolean 改動需要對應的新 UUID v4 版本及 clock +1。版本變動必須與同一次原子寫入中真正改變的 Boolean 共用操作 UUID；只換版本、只加 clock 或夾帶日期均不能代替 Boolean 改動。
4. 批次會包含原本已完成的項目，這些項目的版本仍可更新，但必須共用本批真正 Boolean 改動的 UUID。不能一律要求每個版本更新都翻轉 Boolean，否則會誤擋章節操作。全 115 項混合批次也納入測試。
5. 日期修改需要新的 `_version` 和 clock +1；刪 day 以保留版本的 tombstone 表示。祖先驗證保留既有課程、版本與日期紀錄，防止 Firebase 對刪除節點略過 `.validate` 造成繞過。
6. generation／era 建立後不可由一般客戶端改動，整份文件或 fence 不能刪除。首次建立只准 `initial-v3`、era 0、clock 0/1；重置後任意新 generation 必須由另行授權的管理程序建立。clock／era 限制安全整數，clock 只可不變或 +1。
7. `courses`、四科子容器、`versions`、`firstCompletion` 存在時必須有子節點，不能以 Boolean／字串替換來略過 child validator；空 map 在 RTDB 是不存在節點，正常空文件仍可建立。只接受目前 115 個課程 ID、已知欄位、Boolean、UUID 及日期格式。generator 從現有課程資料導出 allowlist，CI 檢查產物沒有漂移。未來課程增刪要一起審查 Rules；不能任意刪除既有 tombstone。

**Rules 不證明呼叫來源或客戶端 CAS 程式曾執行。** Realtime Database Rules 看合併後資料，無法區分 transaction、完整 set 或多路徑 update；只要合併結果完全符合契約，合法子路徑 multi-update 也應通過。Rules 不能證明 UUID 從未在久遠歷史使用過，也不能阻止已獲授權 owner 故意提交一筆結構合法的新操作。與同一 UUID 的合法 Boolean 批次一起更新未改值成員，是現有批次契約允許的行為，不應宣稱任何版本值變動都被拒絕。

日期另有一個明確限制：現有 `setDate` 允許對相同日期再次提交新操作，因此「日期不變、`_version` 更新、clock +1」與正常重複日期操作無法區別。沒有 clock 的單獨日期版本修改會拒絕；有完整合法 clock 的相同日期新操作仍允許。若要求連具 owner 權限的惡意客戶端也不能製造合法外觀的操作、重用歷史 UUID、或改寫上述日期版本，**此威脅模型仍 NO-GO**。最小強化方向是封鎖 canonical 直接寫入，交由受控 server writer 核對 immutable intent／bases／generation 並保存可驗證去重資訊；不能只新增前端版本字串或 client-supplied marker。本輪依「只修改 Rules 候選與測試」的範圍，不擅自增加後端／改寫同步協定。

## 舊 writer 實際隔離範圍

| 路徑 | 新版用途／來源 | 候選 Rules 對舊程式的效果 |
|---|---|---|
| `videos`、`biochem`、`physiology`、`pharmacology` | 新版經 facade 讀 canonical；`course-sync.js` 唯一 writer | 永久 deny，不能重建舊進度 |
| `questOS/v1/courseFirstCompletion`、`courseSyncV2` | 舊日期與 gate 已退役 | 永久 deny，包括 ancestor／混合 multi-update |
| `gamification/v1/days`、`awards` | `workspace.js` 歷史唯讀 | 保留 owner 讀；永久 deny 寫，防舊 XP 帳本復活 |
| `habits` | `life-store.js`、原頁習慣 | owner 可寫，舊 writer 仍可能競爭 |
| `questOS/v1/training` | `life-store.js` | owner 可寫，舊 writer 仍可能競爭 |
| `questOS/v1/adaptiveStudy/settings` | `adaptive-store.js` | owner 可寫，舊 writer 仍可能競爭 |
| `gamification/v2/timeTasks` | `time-tasks.js` | owner 可寫，舊版可能帶入獎勵欄位 |
| `gamification/v3/planner/tasks` | `daily-planner.js` | owner 可寫，舊版可能帶入任務獎勵欄位 |
| `custom_events`、`checklist` | 原頁行事曆與清單，經 `sync.js` | owner 可寫，舊 writer 仍可能競爭 |
| 王國／建築／領主等級 | 既有課程、任務、生活投影 | 沒有另一份王國 cloud writer；以上來源變動仍會影響投影 |

測試實際讓 owner 的獨立舊式 SDK 對七組 shared paths 寫入並由 Emulator 管理端驗證，證明風險存在。沒有假設新版本、重新登入、刷新或 Service Worker 能使全部舊分頁失效。歷史 pending 繼續隔離保留，不重送、不丟棄、不按 Boolean 判成功。

### 全帳號重置的最小前提（尚未實作）

課程 fence 可阻止課程舊請求，但不足以保護上述七組 shared roots。可評估小範圍 DB facade 映射，把這七組 writer／reader 改到 `users/<uid>/lifeV1/<generation>/...`，由管理端唯寫的 account control 指定目前 generation；Rules 要求 `$generation` 等於目前 control，永久 deny shared 舊路徑與所有舊 generation 的寫入。重置時原子輪換 control 與課程 generation／era；舊頁面即使仍登入、持有舊 pending，也只能命中被拒絕的舊位置。需要測試 session／本機 cache 隔離及七組產品流程後才能採用，不能只改路徑字串就宣稱完成。受控 server writer 也是替代方案，單純 revoke token 不足以長期隔離同 UID 舊程式重新登入。

本輪沒有實作這項擴充。**全帳號真實重置仍阻擋；不應在 shared roots 仍可寫時刪資料再開回原 Rules。**

## 可執行的切換順序（本輪只準備，沒有執行）

### 0. Codex 現在可自動完成

```sh
node scripts/course-rules-candidate.mjs --check
node scripts/course-rules-candidate.mjs --prepare
npm test
npm run lint
npm run build
B2B1_EMULATOR_JAR="$PWD/work/firebase/database.jar" FIREBASE_SDK_DIR="$PWD/work/firebase" node tests/sync-queue/durable-course-emulator.mjs
```

`--prepare` 只在 `work/course-cutover/` 產生綁定 `owner-config.js` 的兩份候選與 SHA-256 manifest（含 Head 與 worktreeDirty；未提交工作另列阻擋），固定 `executable:false`、列出未完成阻擋；沒有網路、deploy、Auth 或資料刪寫 API。Emulator runner 只接受 checksum 固定的 SDK 9.22.0／Emulator 4.11.2，自己建立 loopback 連線，不接受遠端 Database URL。CI 自動下載並驗證依賴。正式執行前必須重新準備 packet，核對 exact Head、CI、UID、Rules hash。

### 1. 未來取得明確正式切換授權後：先檢查、備份、凍結

1. Codex 重新讀取唯讀部署 metadata，驗證 team／project、Production SHA、Firebase project／instance／UID，取得 live Rules 與精確 scope 的 server backup，保存 checksum。正式 Rules 的有效 ancestor grants、現有資料 schema、shared roots 的歸屬需與本候選逐一比對；不匹配就停止。不能把 localStorage 或 Firebase SDK 快取當 server backup。
2. 準備同一 v3 契約的待發布 build、維護頁及回復 build，固定不可變 deployment ID，先在隔離環境完成全部流程。不要先 merge main 觸發正式 Git 自動發布；未來若用 CLI，先 stage Production build 而不指派正式 domain，驗證後才 promote。Preview promote 可能重新 build，不能把其結果當同一個已驗證 build。
3. 在短暫維護窗先啟用經審查的 freeze Rules（所有客戶端寫入關閉）。只換網站／要求關頁無法凍結舊客戶端。待凍結生效後重新取得 frozen server snapshot；以這份快照作初始化依據。之前取得的備份不能代替最後 frozen snapshot。一般使用者既有離線 pending 保留，不自動合併或清除。

### 2. 建立 canonical 並啟用 Rules，然後切網站

4. **先決定初始資料，不能直接把新路徑空白當成功切換。** 如保留既有進度，另行審查並授權一次性 server-side provisioning：從 frozen snapshot 映射固定 115 個 Boolean／首次日期、配置合法版本；來源日期衝突需明確核對，不從 pending 或相同 Boolean 推論。若選擇空白開始，須先取得明確的重置授權且滿足相應隔離條件；本輪沒有這項授權。已有 canonical 則保留其 generation／era 與全部版本，不可覆寫或倒退。
5. 驗證初始化 checksum、日期、115 項 scope 與其他 UID 不變。啟用完整審查後的 active Rules，永久 deny 舊四科／日期／v2／歷史 XP 帳本；不可保留或重新加上 root write grant。正式 Rules 先於新網站開放寫入。此時舊頁面課程寫入失敗，新 canonical 不受影響。
6. promote 經測試的 v3 build 到正式 alias，核對 live build SHA／UID／canonical path 與 Rules hash。七組 shared 生活／任務路徑若仍保留寫入，這次只能稱「課程切換」，不能宣稱「全帳號 reset 已安全」。

### 3. 同步驗收與復原

7. Codex 先做授權範圍內的唯讀驗收：cold load／reload、四科／日期與 frozen server snapshot 一致、無跨 UID、無舊課程寫入、歷史 XP 與王國來源一致，pending 不憑快照清除。唯讀檢查不能證明正式寫入成功。
8. 要驗證正式寫入，未來部署授權需明確包含一組最小 smoke 操作。可選已有首次日期且無 pending 的已完成課程，於兩個登入 context 做 false → true、離線重連／reload，核對 server operation UUID、clock +1、pending 自動清除、首次日期與 XP 未改變。Codex 可自動執行及比較；不需使用者手動逐項測試，但不能在本輪未授權時操作真實進度。兩 context 驗證邏輯同步；真實手機與 OAuth 裝置持久性仍需實機驗收，不與 Emulator 混稱。
9. 驗收失敗立即套用 freeze Rules、保留 journal／server snapshot 與故障證據，不清 pending、不旋轉 generation、不把歷史資料覆蓋回正在寫入的 DB。若有已測 v3 回復 build，可在維持退役路徑 deny 的前提下切回；目前 main `faf357c` 仍用舊課程契約，**不是可恢復寫入的 rollback**。沒有相容 build 就維持維護／唯讀並修復後重試。絕不回復舊 root grant 或重新開放已淘汰路徑。
10. 備份還原只有在 freeze 生效、另行授權並確認不會抹除成功新紀錄時才能執行；不能直接倒退 generation／era。需要 reset／restore 時維持唯一新 generation 和遞增 era，舊請求不得復活。

### 4. 何時可進入真實全帳號重置

只有在七組 shared writer 已完成 server-side 隔離、含舊分頁／重新登入／離線 pending 的測試通過、live Rules 與 ownership／backup／restore 演練通過、課程正式 smoke 通過，並取得該 UID 的**獨立明確重置授權**後，才可依 `RESET_PLAN.md` 進行。清本機只能精確刪該 UID 的已核准鍵，不刪 Auth／其他 UID／整個 origin。本輪尚未達成，也沒有 reset 執行器。

## 結論

候選 Rules 可供再次 Code Review 與正式 Rules 差異審查；尚不能宣稱 Production 已獲保護。正式切換需 live Rules／資料初始化審查及部署授權；全帳號重置另受七組 shared writer 阻擋。對「惡意 owner 仍不可提交合法外觀操作」的更強要求，現有純客戶端契約有上述根本限制，不能以測試通過隱藏。
