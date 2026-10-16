# 正式受管入口：離線準備與權限設計

基準 `46ccc1c94871c22764a15182418ec47264d7b708`。本輪不連線正式 Firebase、不取得身分、不部署、不建立正式 writer。既有 Emulator-only 全流程及六點故障矩陣不變；操作順序仍以 [CUTOVER.md](CUTOVER.md) 為準。

## 已提供：純離線 dry-run

`scripts/managed-cutover-dry-run.mjs` 只讀檔案／本機 Git metadata、計算計畫與寫入新離線檔案；沒有 Firebase SDK、HTTP、token 取得或正式執行功能。拒絕 `--apply`、`--execute`、`--production`、`--dry-run` 等開關，不會因 input 的 authorized／dryRun 旗標取得能力。輸出永遠是 `executable:false`、`authorizationGranted:false`、`productionExecutorIncluded:false`。

```sh
node scripts/managed-cutover-dry-run.mjs --synthetic --out work/managed/synthetic-packet.json
```

輸出檔以 0600、exclusive create 保存，拒絕覆寫舊 artifact。CLI 只印 Head、變更數、patch hash 及輸出位置，不印帳號紀錄／token。合成 packet 仍標示來源未驗證，不是正式操作依據；有未提交工作則 `worktreeDirty:true`，正式審查前重新生成。

日後只有在獨立授權取得原始離線匯出並確認 scope 後，Codex 才可準備：

```sh
node scripts/managed-cutover-dry-run.mjs --backup LOCAL_EXPORT --legacy-rules LOCAL_RULES --reviewed-paths LOCAL_REVIEWED_PATHS --out NEW_LOCAL_PACKET
```

`LOCAL_REVIEWED_PATHS` 是 Codex 從 scope 摘要整理、使用者確認後生成的 JSON path array；使用者不需手工編輯資料庫 JSON。未確認的 existing legacy path 會停止計畫。此檔與 packet 只是離線證據，**不是執行授權**；任意人可以編輯檔案，因此未來執行器必須使用獨立受保護的核准記錄，不能信任其中一個 Boolean。

驗證內容：

- 固定 project `my-exam-1aab9`、instance `my-exam-1aab9-default-rtdb`、`owner-config.js` UID；不允許呼叫者更換 target／URL。未知／寬鬆 live Rules 停止；目前僅接受指定 owner root grant 的已知舊結構。若實際 Rules 寫法不同，另行審查解析規則，不能忽略差異。
- 整份匯出須可解析且非空 object；UID namespace／既有 schema、clock／era、generation 檢查；沿用 `createBlankAccountPlan` 驗新雙 generation、era 遞增及精確原子 patch。全歷史 generation 不重用仍需外部紀錄確認。
- 檢查 Repository 的 active／freeze 候選與 generator 一致，再綁 owner；刪除僅限已確認的 legacy paths，新資料僅限該 UID 的 learningV3、lifeControl、新 lifeV1 generation。其他 UID、Auth、定義不在 patch。
- 列出每個 path 的 create／replace／delete／empty-namespace、前後 leaf 數與 hashes，不複製舊內容。另列精確 UID local keys；未提供 local snapshot 不表示沒有 pending／keys。
- 分別記錄原始 backup／legacy Rules **檔案 bytes hash**、完整 server tree canonical hash、active／freeze 的 canonical 與產出檔案 hashes、原子 patch canonical hash。與 `--prepare` 產物比對時使用 `*RulesFileSha256`；不要混用 bytes 與 canonical hash。
- `verifyManagedDryRun(packet,input,approvedPatchSha256)` 重新產生預期計畫並逐項核對完整 packet／核准 hash，拒絕增刪 path、改 era／generation／target／Head 或把 executable 改為 true。驗證成功仍是 `authorizationGranted:false`，不是正式 apply。

原始 server 來源、最新狀態、資料歸屬、freeze 已生效及備份完整性，無法由 hash 自行證明。凍結前 packet 不能直接拿來初始化；取得最終 frozen snapshot 後必須重新生成並核准 final hashes。

## 尚未提供：正式執行器

正式入口必須是**另一個單次受管工作**，不能把本 dry-run 或 Emulator helper 的 URL／旗標改掉就執行。最低設計如下，尚未建立或授權：

1. 程式內固定 project／instance／Owner UID，拒絕 caller URL、整根 set/import、任意 SDK 命令。只接受保護的核准 manifest：exact Head／CI、source backup hash、Rules hashes、精確 path allowlist、雙 generation／era、patch hash、階段、有效期限與操作識別碼。
2. 身分在核准工作啟動時由 Google 受管身分／ADC、Workload Identity Federation 或 service-account impersonation 短效取得；不接受聊天貼入的 token、密碼或 service-account JSON key。短效期限以平台允許的最短作業時間設定，最長不超過一小時；完成／逾期即退出，保留不含密鑰的 audit evidence。
3. mutation 前重新核對 server／target／freeze／final snapshot／generation registry／patch hash。只用核准 patch 做一次 multi-location update；不使用整庫 Import。管理 SDK 可繞過 Rules，因此 path／UID 鎖必須在受管程式與核准 manifest 都檢查，不能宣稱 IAM 或 freeze 能限制 admin 為單一 UID。
4. 回應遺失或結果未知，維持 freeze、保全最新 server snapshot；只讀比對實際結果，不重送初始化、不倒退 fence、不覆蓋已成功新資料。每個正式階段需獨立核准與停止，不提供一鍵跨過所有關卡。
5. 執行器**不包含網站部署、Auth 編輯或再次 reset**；網站切換由既有 Vercel 權限在另行核准的階段處理。任何 restore／重新空白開始均需新的授權。

## 使用現有 Firebase Owner 權限

使用者維持 Google 官方 Console／Cloud Shell 的正常登入，Owner 可用於核對專案、Rules／匯出與設定最小工作身分；**不需要向 Codex 分享登入憑證或長期 key**。Owner 本人不必把整個專案 Owner 角色交給執行器。

正式作業最小權限分階段配置：唯讀資料／Rules 匯出；獲准 freeze／active Rules 時的 Rules 管理；獲准初始化時的 RTDB 原子資料更新。Auth UID 可在 Console 人工核對；工作只需查核時用 Auth 唯讀能力，絕不授予 Auth 刪除／改密碼。Vercel 部署權限獨立。

Owner 可在 Console 設定專用受管 service account／工作及最小 RTDB 角色；若採 impersonation，僅對該帳號授予工作呼叫者必要的短效 token 取得能力，不授予整個 project 的廣泛 token 角色。精確 IAM roles／conditions 須在建立該工作時核對；若 RTDB IAM 只能到 project 而不能限 instance／UID，受管工作仍須硬鎖 instance、UID、paths、hash，並限制維護窗其他 admin。此權限設定與工作建立都屬未來需授權的正式環境變更，本輪不操作。

## 最短操作與停止關卡

| 階段 | 使用者確認／授權 | 必須停止的情況 |
|---|---|---|
| 唯讀核對 | project／instance／Owner UID、舊資料歸屬、原始匯出與 Rules 來源 | 身分／來源／完整性不明；禁止進入任何寫入 |
| 凍結 | 部署授權中的 freeze hash、維護窗及既有維護 artifact | Rules readback 或一般 writer 拒寫未確認；禁止初始化 |
| 最終快照／dry-run | Codex 產出 scope／diff／hash 摘要；使用者確認歸屬與完整性 | frozen snapshot／隔離還原／source hash 改變 |
| 原子初始化 | **獨立帳號重置授權**：UID、paths／local keys、雙 generation／era、final backup／patch hashes | 缺任一核准、未知結果或其他 admin 活動；保持 freeze |
| active Rules | 部署授權中的完整 owner-bound active Rules hash | 初始化／其他 UID／fence 證據不符；維持或恢復 freeze |
| 網站切換 | exact Head、正常／維護不可變 deployment IDs 及部署授權 | server 前提不齊；不 promote／不新增 Preview |
| 最小 smoke | 明列帳號、操作範圍與驗收；不包含真實 reset | 登入／同步／reload／日期／XP 異常；freeze、保全資料 |

使用者只需確認摘要與分別授權，不必手動修改複雜 JSON；其餘核對由 Codex／受管工具在各自授權範圍執行。當前仍需 ChatGPT Code Review、原始正式證據、受管工作與權限，以及上述正式階段授權。既有維護 Preview 保留；本輪沒有新增 Preview、正式 Firebase 存取或部署。
