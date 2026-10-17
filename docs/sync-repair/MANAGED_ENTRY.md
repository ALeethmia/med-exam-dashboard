> 本輪新增：[內建重置與最短 Spark 首次切換](SELF_SERVICE_RESET.md)。使用者確認後由 Rules 受限地原子輪換 fence；舊受管工具不再是首次上線的必要前置。以下保留原流程與歷史限制。

# NT$0 受管切換入口（預設停用）

本方案取代舊版 KMS／GCS 前置條件。使用既有 Spark RTDB、免費 Cloud Shell／IAM、離線核准簽章；不建立 KMS、GCS、Cloud Run／Functions、付費備份或計費帳戶，不升級 Blaze。網站與帳號重置仍須分別授權。本輪只用合成資料和本機 Emulator，沒有正式連線、身分取得、資源建立或部署。

## 免費能力與尚未證實的部分

依 2026-10-17 核對的官方文件：

- [Spark 定價](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)與 [RTDB billing](https://firebase.google.com/docs/database/usage/billing)：Spark 具有 RTDB 免費額度，不按超量收費；到額度會限制服務，不應以升級或開啟 Billing 解決。Console 核對 Spark、預設 instance 及 Usage 額度；不是 Codex 已獨立核對正式帳號。
- [Cloud Shell pricing](https://cloud.google.com/shell/pricing)：Cloud Shell 免費，不必安裝本機 Firebase CLI；[IAM pricing](https://cloud.google.com/iam/pricing)：IAM API 免費。專用無金鑰 SA 是身分，不是付費運算基礎設施。建立它及授權仍需另外同意；任何步驟要求綁 Billing，立即停止。
- [RTDB REST](https://firebase.google.com/docs/database/rest/start)支援既有資料庫端點；[Rules REST](https://firebase.google.com/docs/database/rest/app-management)支援完整 Rules GET／PUT；[OAuth authentication](https://firebase.google.com/docs/database/rest/auth)要求適當身分與 scopes。**Owner／Cloud Shell 登入不證明 REST 管理權限已可用**。
- [條件式寫入](https://firebase.google.com/docs/reference/rest/database#section-conditional-requests)的 `PUT` + `if-match: null_etag` 可只在空位置建立值；[multi-location PATCH](https://firebase.google.com/docs/database/rest/save-data)保持初始化原子性。不能把 PATCH 當成支援 ETag CAS；本方案分開「metadata CAS claim」與「一次性精確 PATCH」。

結論是技術上不需新增付費服務，**不是本專案的短效 IAM／REST 權限已實測可用**。本輪禁止正式連線，因此該驗證保留為授權後的停止關卡。若既有專案政策不允許無計費的短效身分／API，停止，不使用 Owner token、長期 SA key 或付費替代品。

## 固定信任與離線核准

`scripts/managed-cutover-executor.mjs status` 完全離線、不可寫。`config/firebase/managed-executor-policy.json` 預設 `enabled:false`，固定 `budget:NT$0`、`ledgerBackend:rtdb-cas-v1`。正式啟用前另行審查一個乾淨不可變 commit，填入確認的 HTTPS origin、專用 SA、公鑰 SPKI DER SHA-256；沒有 URL／token／policy／dry-run override，也不接受舊 GCS policy。

KMS 改為**單次維護窗的離線核准 RSA key**。核准者在獨立可信設備或另一帳號的 Cloud Shell 使用內建 OpenSSL，私鑰不送到執行器 Cloud Shell、不進 repository、聊天或 CI；只交公鑰與逐階段簽章。這不是 Firebase／SA 憑證，也不是將現有長期管理金鑰交給工具。若無法分開核准私鑰與執行環境，停止，不以自簽自動同意取代獨立核准。

```sh
# 僅核准者環境；本輪不代為建立正式信任 key。
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out approval-private.pem
openssl pkey -in approval-private.pem -pubout -out approval-public.pem
openssl pkey -pubin -in approval-public.pem -outform DER | openssl dgst -sha256
```

公鑰 fingerprint 經獨立審查固定於 policy。manifest v2 綁定完整 packet／Head、project／instance／Owner UID、備份與 Rules hashes、精確業務 paths、雙 generation／era、patch hash、operation、前階段 receipt、最終 backup bytes hash、**額外唯一協調路徑** `users/<Owner UID>/cutoverAdmin/v1`、用途及最多一小時有效期。v1 核准不相容，必須重新審核；dry-run JSON／Boolean 仍不是授權。

核准者核對 request 的 canonical 原始 bytes 後，每階段分開簽署：

```sh
openssl dgst -sha256 -sign approval-private.pem -out STAGE.signature.bin STAGE.manifest.json
openssl base64 -A -in STAGE.signature.bin -out STAGE.signature.txt
```

不重新排版或加換行，不一次簽完所有階段；結束維護窗後撤銷執行權限、妥善結束此一次性核准 key 的使用，保留公鑰／簽章作稽核。

## Cloud Shell 最短操作與權限

以下全部留待獨立授權，不是現在執行：

1. Owner 在 Console 確認 `my-exam-1aab9`、預設 RTDB、Owner UID、Spark／沒有 Billing、免費額度足夠；保留完整匯出與 Rules 的本機異地副本，確認舊 shared roots 資料歸屬。保留維護 artifact，不要求新增 Preview。
2. 配置無金鑰 `becoming-cutover@my-exam-1aab9.iam.gserviceaccount.com`。執行人僅對該 SA 取得 `roles/iam.serviceAccountTokenCreator`；SA 使用 RTDB 自訂最小角色候選 `firebasedatabase.instances.get`／`firebasedatabase.instances.update`（由管理員確認現行 IAM 能力）。不授 Auth 編輯、資料庫建立／刪除、project Owner／Editor、KMS／GCS 角色。確認 IAM Credentials API 可在不啟用 Billing 下使用；不可默認 API／角色已配置。短效 token 由工具使用 `gcloud ... --impersonate-service-account=... --lifetime=600s` 與 firebase.database／userinfo.email／cloud-platform scopes 取得，僅放記憶體，失敗不降級。
3. checkout reviewed SHA，確認乾淨與相關測試。建立 repository 外 0700 私密目錄；備份／Rules／scope、packet／input、最終 snapshot、簽章／receipts 均 0600，使用絕對路徑。執行器沿用原來 `prepare`、`request`、`run-stage` 命令，不接受免費旗標來繞過核准：

```sh
node scripts/managed-cutover-executor.mjs prepare \
  --backup PRIVATE/backup.json --legacy-rules PRIVATE/legacy-rules.json \
  --reviewed-paths PRIVATE/reviewed-paths.json --out-dir PRIVATE
node scripts/managed-cutover-executor.mjs request \
  --packet PRIVATE/packet.json --input PRIVATE/input.json \
  --stage freeze --operation cutover-UNIQUE-LOWERCASE-ID \
  --expires-at APPROVED-UTC-TIME --out PRIVATE/freeze.manifest.json
# 核准者獨立簽署後，執行人只執行這一個階段：
node scripts/managed-cutover-executor.mjs run-stage \
  --packet PRIVATE/packet.json --input PRIVATE/input.json \
  --manifest PRIVATE/freeze.manifest.json --signature PRIVATE/freeze.signature.txt \
  --public-key PRIVATE/approval-public.pem --receipt-out PRIVATE/freeze.receipt.json
```

`PRIVATE` 等占位由 Codex 依核准摘要填成私密絕對路徑／合法時間與 ID；使用者不手改資料庫 JSON。所有輸出 exclusive create，不覆寫。原本 reset-plan／dry-run 的 path／hash／generation／era 及獨立重置授權完全保留。

4. 每列都「新 request → 人工確認／離線簽章 → 單一 run-stage」，無一鍵跨關卡：

| 階段 | 額外參數與停止條件 |
|---|---|
| freeze | 先以短效管理身分讀完整資料／Rules，與核准 input 完全相符才 PUT freeze 並讀回。**確認 freeze 後才在 RTDB 建 claim**，不信任舊 root grant 保護鎖。Rules PUT／資料 CAS 若拒絕或不明立即停。此時才證實該身分的實際管理操作；不能提前宣稱 Owner 足夠。另驗普通客戶端不能寫 |
| final-snapshot | request／run 加 `--previous PRIVATE/freeze.receipt.json`；run 加 `--snapshot-out PRIVATE/FINAL.json`。取得整份 server tree，包含協調 metadata；記錄完整 bytes／canonical hash。完整性與隔離還原驗證完成後才核准 initialize |
| initialize | 兩命令加 `--previous PRIVATE/final-snapshot.receipt.json --final-backup PRIVATE/FINAL.json`。獨立**真實帳號重置**核准，驗完整 final bytes、業務樹、Rules、UID／paths／generation／era／patch；先取得永久帳號鎖，再送**一次**精確原子 PATCH。結果不明只讀、不重送、不補成功 receipt、不進下一關 |
| active-rules | 兩命令加 `--previous PRIVATE/initialize.receipt.json --final-backup PRIVATE/FINAL.json`。驗成功 receipt／完整備份、凍結與預期業務樹才開 active。失敗只嘗試 freeze，不恢復舊 Rules／舊資料 |

5. 停止。網站切換／smoke 另依 CUTOVER 的部署授權處理；本工具沒有網站部署／Auth 修改。事後撤回 impersonation／SA 權限，保留完整備份與稽核檔。任何配額不足、Billing 提示、權限不足、無法確認 freeze 都是停止條件，不升級方案。

## 免費協調與備份的安全邊界

正式入口完全移除 GCS 呼叫；RTDB metadata CAS 為 server-side create-only，412／回應遺失不重試。每個 stage 有 claim／receipt，另有 `initialize-once` 永久帳號鎖與 patch hash 鎖。換機、重開 Cloud Shell、換 operation 或新 patch 都不能自動二次初始化。鎖落盤後即使 PATCH 尚未送出也停止，不提供解鎖／刪除／覆寫命令。

現有 freeze／active 候選 Rules 已無 ancestor grant，協調路徑由預設 deny 保護，**無須改同步核心或候選 Rules**。普通 owner 客戶端不能讀寫／刪除鎖或祖先；管理 IAM 仍可繞過 Rules，無法靠它保護惡意 admin。維護窗必須排除其他 admin writer，不能將 SA 的管理能力說成只有單一 UID。

業務資料比較只排除 manifest 明列的**該 UID 的協調根**；其他 UID、定義與任何其他節點仍逐樹比較。原始 input backup 的 full hash、最終 snapshot 的 full bytes／canonical hash 都保留；final snapshot 不偷偷刪 metadata。初始化 receipt 的 `resultDataSha256` 明確表示排除協調根後的業務樹，不能冒稱整庫 hash。PATCH 不含協調節點，也不能將 metadata 忽略擴大成其他 paths。

**還原注意**：完整備份可含早於 initialize 的 metadata。未來任何管理還原必須保全伺服器較新的 `cutoverAdmin/v1`，不可用舊 snapshot 覆蓋它；否則會丟掉永久鎖。本執行器仍禁止整庫 Import／root PUT，也不提供恢復舊 metadata 的功能。任意管理員手動刪鎖、換庫或整庫回復不在可保證範圍；這與持有管理權限者能繞過程式限制的邊界相同，不可把 Cloud Shell 本機檔當永久跨機鎖替代。

## 本輪驗證與剩餘阻擋

僅 Emulator／合成資料：保留全部六組執行器安全測試，新增真正 RTDB CAS 的四組：完整四階段／完整 backup metadata、普通合法 UID 可讀課程但不能刪鎖或祖先、兩個新程序競爭與永久帳號鎖、PATCH ACK 遺失／CAS ACK 遺失／重啟／其他 UID 漂移。沒有把 Map 替身結果當成真正 server CAS 證據。相關單元驗 CAS 的固定 UID/path/header、拒絕與不重試。

技術上可用 NT$0 方案；正式仍 NO-GO：未配置 reviewed policy／獨立核准 key、未核對專案當前免費額度、未在獲授權後實測短效 IAM／REST 管理能力，亦沒有部署／重置／正式驗收授權。任何條件不符就停，不降低核准、備份、一次性或 freeze 保證。
