# 內建重置與最短 Spark 首次切換

本頁是本輪建議路徑。保留 PR #26 的原子課程同步、generation/era、生活隔離與舊的離線 reset-plan；首次切換不再需要 managed executor、KMS、GCS、獨立 RSA key、SA impersonation 或長期憑證。舊受管工具仍預設停用，作為另一條歷史方案，不是本流程前置條件。

## 已實作的使用者流程

「設定 → 資料管理 → 重置學習與生活進度」列出範圍，必須勾選、輸入目前 email、最後確認，再用同一 Google 帳號重新驗證。Rules 要求固定擁有者 UID、email_verified 與五分鐘內 auth_time；前端只有 Firebase 使用者 ID token，沒有 Admin SDK／管理員權限。

送出前以伺服器 REST 讀取契約、兩組 fence 及設定，保存該 UID 的操作 ID、完整精確 patch、SHA-256 與目標 era。只呼叫一次原子 multi-location PATCH，包含：

- 替換 learningV3：全新 UUID generation、era + 1、clock 0、空課程／版本／首次日期。
- 替換 lifeControl：獨立 life_UUID generation、era + 1、resetId。
- 刪除目前 lifeV1 舊 generation；只複製該次 server 讀取的 adaptiveStudy/settings 與 training 設定至新 generation。習慣、日期、活動、任務、行程與清單不複製。
- 建立同一次操作的不可覆寫 resetReceipts/UUID，含兩組前代 generation／目標 era／server timestamp。Rules 驗證整組一致、舊前代仍相同、UUID 收據／新生活 namespace 不曾存在。沒有 UID 或其他祖先 write grant。

成功即停用本頁所有 writer、清除該 UID 的過期進度快取，完整 reload。Auth、外觀、課程目錄、其他 UID 不變。原 IndexedDB claim 只含舊 operation ID，沒有對應 journal 就不會重送；不刪除整個跨 UID 資料庫。其他裝置的舊課程 journal 遇 generation fence 退休，舊生活 generation 被 Rules 拒絕，不會把 intent 改綁到新 generation。

共用歷史 XP／legacy 根可能仍含歸屬不明資料，**不由使用者重置刪除**；重置後的生活 facade 把歷史讀取映射至新的空白 namespace，舊 XP／日期不會恢復。更早的非目前 generation 如有保留，也繼續隔離。本功能是進度重置，不是整庫或個資安全抹除。

逾時、網路中斷、拒絕、ACK 遺失或本機結算失敗都保留證據，不重新 PATCH。reload 在啟動 writer 前只讀查核自己的收據；精確 era 相符才清快取並重新載入。無收據或讀取失敗會維持阻擋，提供只讀查核，需維護者核對，不提供盲目「重試重置」。這也表示確定拒絕但仍有證據時，保守停止而不自動解鎖。不得刪除證據來猜測未提交；若後續人工處理，需另外明確授權。

## 最短首次正式切換（本輪未執行，全部正式操作仍須授權）

以下針對 Owner 已同意從空白開始；不是舊資料遷移。使用同一現有 Spark RTDB 與免費 Firebase Auth，新增費用 NT$0，不開 Billing／Blaze、不購買資源。網站沿用現有免費 hosting 與配額；若要求付費，停止。

1. **核准這個不可變 Head 與兩項操作範圍**：Rules／網站部署，以及指定 UID 的空白初始化。確認現有專案、instance、Owner UID、免費配額與 Google 授權網域。審查 `node scripts/course-rules-candidate.mjs --prepare` 生成的 owner-bound active／freeze Rules 與 hash，不能直接發布佔位 UID 版本。此命令純離線。
2. **經 Firebase Console 發布 freeze Rules，確認已生效後匯出完整最終 JSON 與現行 Rules**，私下保存備份／hash並完成還原演練。確認指定 UID 的 learningV3、lifeControl 都尚不存在；兩者只缺一個時停止人工核對。其他 UID、靜態目錄、共用根的歸屬必須確認；本方案保留原資料，不做整庫 Import 或 shared root 清空。沒有舊 Rules 已支援新版契約的假設。
3. **經 Console 發布本 Head 的 owner-bound active Rules，讀回比對；確認沒有舊 root／ancestor grant**。確認後由 Console 在且僅在 `users/<UID>/selfResetContract` 寫入 `{"version":1}`。此 metadata 客戶端不可寫，缺少時 Rules 與前端都拒絕重置／首次初始化。marker 是維護者完成切換的紀錄，**本身不證明 Rules 已部署**；不可先在舊 Rules 下建立 marker。
4. **授權部署／切換本 Head 的網站**（含 `/first-start.html`），Owner 在首次啟用頁登入、勾選空白開始、輸入 email、二次確認與重新驗證。只有兩組 fence 都不存在才可建立 era 0 的空白契約與不可覆寫收據，單次原子 PATCH；不使用管理憑證。已有正常契約時首次入口拒絕再次初始化，日後使用設定頁。若原有 canonical 契約已存在，就跳過首次初始化，正常登入後依另行授權從設定頁重置。
5. **核對收據與兩組 fence，再做已授權的最小 smoke**：新課程／日期與一筆生活記錄、reload、舊離線分頁無法回寫、其他 UID／目錄未變。若 smoke 會寫入真實紀錄，也須在核准範圍內。任一階段不明就停止；必要時回到已核准的 freeze／維護狀態，不還原舊寬鬆 Rules、不降低 era、不重送初始化。

正式 Console 的 freeze／active Rules Publish、metadata 寫入、網站部署、指定 UID 空白初始化／重置與真實 smoke 均**尚未授權或執行**。本輪只允許合成 Emulator、測試與 Draft PR commit/push。

## 針對性驗證

- Node：self-reset、reset-plan、life-isolation、course-rules、durable-course-sync。
- 真正 Chromium + SDK 9.22.0 + RTDB Emulator 4.11.2：`B2B1_EMULATOR_JAR=... FIREBASE_SDK_DIR=... node tests/sync-queue/durable-course-emulator.mjs --self-reset-only`。沒有正式 Firebase 請求；Auth 為合成身份，不能代替正式 OAuth／網域配置驗證。
- 包含雙確認、過期／未驗證／其他 UID／partial／mixed／ancestor 拒絕、原子成功、兩分頁離線退休、新同步、ACK 遺失只讀恢復、拒絕後停寫、首次初始化不可重做。

本輪本機結果：相關 Node 37/37（最後小幅驗證補強後再跑其中 16/16）、重置／首次啟用 Emulator 7/7（含同 baseline 並行重置僅一個成功）、既有課程同步瀏覽器 5/5＋設定導覽 1/1、build／lint／Rules 產物一致性通過。既有 CI 仍會跑完整回歸；本機未重跑全面測試。Google OAuth 使用正式網域的驗證與正式資料切換不在本輪授權內。
