# 受管切換入口（尚未取得正式執行授權）

離線計畫仍用 `managed-cutover-dry-run.mjs`／`reset-plan.js`；獨立執行器為 `scripts/managed-cutover-executor.mjs`。本輪只使用合成資料與 Emulator，沒有取得正式身分、連線正式 Firebase、建立雲端資源或部署。網站與帳號重置仍是兩項不同授權。

## 預設關閉與核准契約

```sh
node scripts/managed-cutover-executor.mjs status
```

此命令不取 token、不連網、不寫入。Repository 的 `config/firebase/managed-executor-policy.json` 預設 `enabled:false`，缺任何信任設定就拒絕正式執行。沒有 `--apply`、URL、token、policy、dry-run 切換或跨階段命令。既有 dry-run 的 `executable:false` 等標記仍只描述該離線工具，不表示新入口已獲授權。

正式啟用前，必須在**另行審查的不可變 commit** 固定：已確認的資料庫 HTTPS origin、固定專案／instance 的專用 service account、專用 ledger bucket、獨立核准者的 KMS 公鑰 SPKI DER SHA-256。Owner UID 固定來自 `owner-config.js`。不得只在工作目錄臨時改設定；執行器要求乾淨 checkout、Git Head 與 packet／簽署 manifest 的 Head 一致。信任設定尚未完成，現在不能執行正式階段。

核准 manifest 綁定完整 packet hash、固定 target、Head、原始備份 bytes hash、完整來源樹 hash、舊／freeze／active Rules hashes、精確 paths、雙 generation／era、patch hash、操作 ID、前階段 receipt hash、最終備份 bytes hash、階段用途、最長一小時期限及必要人工作業證明。簽章採 SHA-256／RSA（建議 KMS `RSA_SIGN_PKCS1_2048_SHA256`），公鑰必須吻合 reviewed policy；把 Boolean 或 JSON 改為 authorized 無效。

每階段獨立簽署、獨立執行：`freeze` → `final-snapshot` → `initialize` → `active-rules`。沒有「全部執行」。初始化另需 **account-reset:exact-patch** 核准；部署同意不包含放棄舊資料。所有階段只允許維護窗內沒有其他 admin writer 的情況。管理身分可繞過 Rules，程式不能阻止另一位持有管理權限的人直接改庫。

## Cloud Shell 所需資源與最小權限

使用者在官方 Cloud Shell 正常登入，不向 Codex 分享密碼／token／長期 JSON key。Cloud Shell 登入本身**不代表有資料庫管理權限**。Owner 在獨立授權後準備：

| 主體 | 所需能力與邊界 |
|---|---|
| 執行人 | 對 `becoming-cutover@my-exam-1aab9.iam.gserviceaccount.com` 的 `roles/iam.serviceAccountTokenCreator`，只限該帳號，不授 project-wide impersonation；用完撤回 |
| 專用執行 SA | 目標 project 的 RTDB 讀取資料／Rules、更新資料／Rules。最小自訂角色候選為 `firebasedatabase.instances.get`、`firebasedatabase.instances.update`；須由管理員依目前 IAM 支援核對並在隔離專案確認 REST 讀寫／Rules 能力。不要直接給 Owner、Editor、Auth 管理或 RTDB 建立／刪除權限 |
| 專用執行 SA | 專用 GCS bucket 的 `storage.objects.create`、`storage.objects.get`；不給 delete、update、list 或 bucket 管理。Bucket 預先開啟 versioning／保留政策並禁止自動清除 `v1/` ledger；不能換桶來重跑 |
| 獨立核准人 | 指定 KMS asymmetric key version 的 `cloudkms.cryptoKeyVersions.useToSign`（例如 key 級 `roles/cloudkms.signerVerifier`）。核准人讀取公鑰；執行 SA 不可簽章／管理此 key |

IAM 無法將 RTDB admin 能力縮成單一 UID/path，**不能把執行器 path 檢查描述成 IAM 沙箱**。因此只在短維護窗授權，固定 SA／bucket／project，禁止其他管理 writer，事後撤回。Owner 可設定資源及授權，無需建立長期 service-account key。若 IAM 無法提供所需最小權限、KMS／GCS 不可用或身分不明，停止；不要改用 Owner token 或寬鬆角色繞過。

執行器內部呼叫 `gcloud auth print-access-token --impersonate-service-account=... --lifetime=600s`，使用 cloud-platform、firebase.database、userinfo.email scopes。token 僅在記憶體，禁止自行傳入 token。失敗不降級到 ADC、Cloud Shell 預設帳號或長期 key。此輪沒有實際驗證 GCP IAM／KMS／GCS，相關權限與資源仍是正式前置阻擋。

## 最短 Cloud Shell 清單

下列是**未來獨立授權後**的操作，不是現在執行。Cloud Shell 已有 Node、Git、gcloud；不需要 Firebase CLI。Codex 可整理摘要／產生檔案，使用者只核對 target、舊資料歸屬、放棄紀錄與每階段核准，不手改複雜 JSON。

1. Owner 核對 project／instance／UID、最新 live Rules、完整伺服器匯出（不是 SDK cache）、備份異地副本、維護網站 artifact 及停機窗。先完成上表資源／權限設定與 policy commit 審查。checkout 該不可變 SHA；確認完整 CI。取消其他管理 writer，停止網站寫入；freeze 才是伺服器屏障。
2. 建立 repository 外的私密目錄，例如 `umask 077; mkdir -m 700 /tmp/becoming-cutover-private`。原始 backup、Rules、核准 scope path array 僅放此處，檔案 0600；不放 repository／PR／CI artifact／公開日誌。**prepare/request/status 完全離線**。

```sh
node scripts/managed-cutover-executor.mjs prepare \
  --backup /tmp/becoming-cutover-private/backup.json \
  --legacy-rules /tmp/becoming-cutover-private/legacy-rules.json \
  --reviewed-paths /tmp/becoming-cutover-private/reviewed-paths.json \
  --out-dir /tmp/becoming-cutover-private
```

自動產生 `packet.json`、`input.json`，包含隨機新 generations 與精確 atomic update；使用者只審摘要。拒絕覆寫已存在的 artifact。備份／Rules 若與伺服器不符，freeze 前停止，不自動刷新核准。

3. 每次只產生一個 `request`（`--expires-at` 明確 UTC，例如核准後 30 分鐘；`--operation` 本次固定且唯一的 `cutover-...` ID）。第一階段例：

```sh
node scripts/managed-cutover-executor.mjs request \
  --packet /tmp/becoming-cutover-private/packet.json \
  --input /tmp/becoming-cutover-private/input.json \
  --stage freeze --operation cutover-REPLACE-WITH-LOWERCASE-UNIQUE-ID \
  --expires-at REPLACE-WITH-UTC-TIME \
  --out /tmp/becoming-cutover-private/freeze.manifest.json
```

占位值必須由 Codex 根據核准摘要產生合法值。獨立核准人核對 canonical manifest，使用自己的短效 Google 身分簽署該檔（不把 signer 權限給執行 SA）：

```sh
gcloud kms asymmetric-sign --project=APPROVED_KMS_PROJECT --location=APPROVED_LOCATION \
  --keyring=APPROVED_RING --key=APPROVED_KEY --version=APPROVED_VERSION \
  --digest-algorithm=sha256 \
  --input-file=/tmp/becoming-cutover-private/freeze.manifest.json \
  --signature-file=/tmp/becoming-cutover-private/freeze.signature.bin
base64 -w0 /tmp/becoming-cutover-private/freeze.signature.bin > /tmp/becoming-cutover-private/freeze.signature.txt
```

公鑰 `approval-public.pem` 必須由核准 KMS version 取得，與 policy 中 fingerprint 相符；不能接受執行人任選公鑰。簽署檔案就是 request 的 canonical bytes，不加換行、不重新排版。獨立簽署是正式變更授權；測試通過不是授權。

4. 執行一個階段：

```sh
node scripts/managed-cutover-executor.mjs run-stage \
  --packet /tmp/becoming-cutover-private/packet.json \
  --input /tmp/becoming-cutover-private/input.json \
  --manifest /tmp/becoming-cutover-private/freeze.manifest.json \
  --signature /tmp/becoming-cutover-private/freeze.signature.txt \
  --public-key /tmp/becoming-cutover-private/approval-public.pem \
  --receipt-out /tmp/becoming-cutover-private/freeze.receipt.json
```

後續每列都重複「產 request → 人工確認／獨立簽署 → run-stage」，不能預先簽完或用迴圈一鍵執行：

| 階段 | request / run-stage 額外參數 | 停止關卡 |
|---|---|---|
| freeze | 無 previous | live Rules／整樹與已核准備份一致；寫入 freeze 並讀回；來源若改變就停止。另以普通客戶端驗證拒寫 |
| final-snapshot | 兩者 `--previous freeze.receipt.json`；run-stage `--snapshot-out FINAL.json` | 讀回完整凍結樹，寫私密最終檔與 bytes hash；須完成完整性／隔離還原驗證再核准 initialize。若與凍結前計畫不同，停止重新審查，不沿用舊核准 |
| initialize | 兩者 `--previous final-snapshot.receipt.json --final-backup FINAL.json` | **單獨真實帳號放棄／重置授權**、完整備份、restore 證據、fresh generations、patch hash、無其他 admin。只發一次 root PATCH，精確 multi-location paths；整樹讀回驗證其他 UID／定義都沒變 |
| active-rules | 兩者 `--previous initialize.receipt.json --final-backup FINAL.json` | 已確認初始化 receipt、凍結規則及完整預期樹一致才更新；成功讀回完整 active Rules |

表中檔名均使用私密目錄的**絕對路徑**。每階段使用新的 manifest／signature／receipt 檔，不覆寫。初始化不讀取或刪除 Firebase Auth，不含整庫 Import、root PUT、網站部署或第二次自動重置。舊 shared roots 的刪除僅限明列且已確認屬此 Owner 的路徑。

5. active 後停止，由另行部署授權切換既有正常網站 artifact，再按 CUTOVER 驗登入／課程／日期／任務／XP／王國／重連。此工具不執行任何 Vercel 操作。確認或保留維護狀態，撤回短效 impersonation 與 SA 權限，保留不可變 ledger／備份／簽章／receipts。備份不得因結束而刪除。

## 一次性鎖與故障停止

正式 ledger 用 GCS `ifGenerationMatch=0` 原子建立每階段 claim／receipt，另以 patch hash 建立全域初始化鎖；只接受前階段已落在 ledger 的成功 receipt。兩個 Cloud Shell 程序、改 operation ID 或重新啟動都不能重送同一 patch。ledger 不存個人紀錄，只存 hashes／階段；禁止清除 claim、換 bucket 或換 patch 來掩蓋失敗。

任何初始化送出後的錯誤都不重試，讀回比對並回報 `approved-result-present`／`different-or-uncommitted`／`unavailable`，保留 claim。即使結果完全吻合，也**不自動補成功 receipt 或進 active**：保持 freeze，人工審查伺服器證據與新的獨立復原授權。本工具沒有「解鎖再 reset」命令。PATCH 尚未送出但 claim 已消耗也一樣停止。

active 回應遺失／receipt 落盤失敗時，只嘗試重裝已核准 freeze 並讀回，永不恢復舊 root grants，不回復舊資料。若 freeze 未確認，輸出 `freezeConfirmed:false`，必須停止所有後續動作並由獲授權管理員確認／凍結；不能宣稱網路故障時一定能安裝 Rules。維護頁本身不能撤銷其他分頁或管理身分的寫入權限。

## 本輪證據與正式缺口

直接執行同一 stage engine 的 Emulator 測試覆蓋：簽章／target／Head／path／hash／era 竄改、期限、跳階段、四階段成功、完整快照、其他 UID／定義保留、備份漂移、兩程序競爭、換 operation 重送、PATCH 前失敗及寫後回應遺失、snapshot／ledger 失敗、freeze／active 回應遺失及安全凍結。正式 GCS adapter 另驗證 create-only precondition，Emulator ledger 以共享原子 Map 模擬；**不是 GCP IAM／GCS／KMS 的線上整合驗證**。

尚缺：reviewed policy 的實際 endpoint／SA／bucket／公鑰、隔離 GCP 權限驗證、正式來源與最新備份／restore 證據、核准者身分與部署／重置分階段授權。這些未滿足前只能進授權準備與 Code Review，不能執行正式切換。
