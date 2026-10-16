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

## 本輪證據與剩餘阻擋

`createBlankAccountPlan` 僅產生 `executable:false` artifact，沒有 SDK、Auth、網路或 apply 能力。直接單元測試與 loopback Emulator 的 `--blank-only` 驗證空白初始化、freeze、其他 UID／靜態資料、實際登入流程（合成 Auth）、課程／日期／任務／習慣、XP 與王國；完整回歸由最終 Head CI 執行。結果連結以 PR 描述為準。

正式部署執行仍 NO-GO：原始 live Rules／完整 frozen backup／ownership 尚未獨立驗證，沒有正式管理執行權限、兩份授權、production smoke 或相容 rollback build。可以提交**部署授權審查**；審查須把上述關卡與獨立 reset 決策列為前置條件，不能直接開始部署。真實重置不因 CI 綠燈自動獲准。
