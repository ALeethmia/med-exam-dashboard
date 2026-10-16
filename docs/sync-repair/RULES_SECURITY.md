# 部署前 Rules 驗證紀錄

基準 Head：`948ac6fc54e88b17c5ef8df1cfbcb7d1151ecc47`。核心同步與產品程式保持此基準；本輪只加 Rules 候選、測試、離線準備工具與切換文件。這份紀錄不表示正式 Rules 已部署。

## 修正前後

在相同 SDK 9.22.0／Database Emulator 4.11.2／Chromium、合成 `fixture-A` 的環境，將 fixture 暫換為基準 Head 的原始 Rules，新測試立即失敗：一般客戶端可建立任意 initial generation。原始 Rules 的 Boolean 與版本 validator 也只檢查型別，沒有交叉核對。

後續對中間 Head `f5b5d76` 再作攻擊驗證，發現已知容器可被改成 primitive，沒有子節點就會略過 child validator。新增 7 種初始化拒絕測試（generation、era、courses／科目／versions／firstCompletion 容器），舊候選會失敗；最後補上各容器 `hasChildren()` 驗證。空 map 在 RTDB 中是不存在節點，合法空文件初始化仍可通過。

候選已補上：容器完整性、owner／UID 隔離、Boolean／UUID／clock 關聯、課程與版本成對存在、禁止刪除 tombstone、固定 generation／era、已知 115 項資料範圍、退役寫入 deny、歷史 XP 帳本唯讀。候選與測試 fixture 用同一 generator，避免只測到比較安全的替身。

## 本輪測試

| 驗證 | 結果／範圍 |
|---|---|
| 真實 Becoming + SDK + Emulator | 65 組場景，含 7 次初始化拒絕、原有 12 組產品與故障流程，全部保留 |
| Rules 攻擊 | 46 組逐一拒絕並比較整個合成 DB，確保沒有部分寫入 |
| 身分隔離 | 一組場景內 24 次匿名／其他 UID／ancestor／舊路徑讀寫拒絕；其他 UID 原值不變 |
| 合法操作 | 空文件首次建立、勾選、日期編輯／tombstone、章節混合批次、115 項原子批次、合法 child multi-update、同快照重試；115 項由真正 Becoming writer 提交，驗證 UUID／clock 與 pending 清除 |
| 恢復 | 離線／重連、reload、確認遺失、永不回覆、延遲 proof、多分頁、無 Web Locks、合成 reset 後繼續使用 |
| 維護候選 | 8 組寫入拒絕，包含完整合法 canonical 操作與七組 shared writer；owner 讀取仍可用 |
| 未解決風險正向對照 | 合成舊 SDK 寫七組 shared paths 成功，再由管理端讀回；全帳號 reset 阻擋確實存在 |
| Node | 226 項通過，包括候選／fixture 一致、固定 allowlist、無 ancestor grant、freeze 無 write grant |
| 產品瀏覽器 | 本機完整 201 項初跑 200 passed／1 failed；該項在 readiness 前期待可見，修正等待順序並保留全部 XP／紀錄斷言，單項重跑及最終 Head CI 驗證；不刪除或 skip |
| Build／lint | 通過；CI 另跑既有 Adapter Emulator 5 組與其他整合檢查 |

並行滿載時，一次中間版本在 115 項後的多分頁等待確認超過 15 秒；相同 Rules 的完整重跑通過。最終將完整 115 項測試改由真正 Becoming writer 原子提交，同樣要求 pending 自動清除，保留後續多分頁／ABA 流程；沒有拉長這些操作的 15 秒等待限制。整體 runner 的硬上限由 240 秒增為 360 秒，用於新增的 53 組場景，並非放寬單項保存確認條件。

46 組攻擊包括：單獨 Boolean／版本／日期版本、Boolean 夾帶 clock、root document 覆寫、孤立版本夾帶另一筆合法修改、不同 UUID 的 witness、沿用舊版本、錯誤型別、刪單筆或整棵課程／版本／日期、日欄位直接修改／刪除、未知課程／欄位、無效日期格式、clock 小數／跳號／倒退、generation／era 改動或刪除、document／ancestor 替換、所有舊課程／日期／v2／XP 路徑、混合 root multi-update、跨 UID 寫入。

每次被拒絕後都以 Emulator 管理端讀取**整個合成資料庫**做 before/after 比較，不能只看 SDK 錯誤訊息或本機快照。攻擊使用獨立 SDK app，與 Becoming 主頁的本機樂觀快取分開；合法寫入照樣由 server 通知主頁。

測試程式：`tests/sync-queue/durable-course-emulator.mjs`、`course-rules-attacks.mjs`。Runner 自己建立 loopback Emulator；沒有遠端 endpoint 選項、真實 OAuth、正式帳號或資料。SDK／JAR 以 SHA-256 固定。首次建立與 reset fence 測試均使用合成帳號。

Node 計數由基準 224 增為 226；瀏覽器數維持 201。本輪不改產品程式，沒有重新改寫先前 main 比較：main 的 109 passed／87 failed、reviewed Head 的 110／86 是上一輪同環境 196 項共同案例的紀錄，詳見 `BROWSER_COMPARISON.md`，不可混稱本輪又跑了一次 main。

## 誠實保留的限制

- 正式 Rules／資料內容未讀取或修改；live ancestor grants 與初始化尚未驗證。正式環境的實際防護不能由 Emulator 推論。
- 七組 shared writer 仍可寫；time-task／planner 舊獎勵欄位仍屬風險，即使 v1 XP ledger 已鎖唯讀，也不能說所有 XP 來源舊 writer 均已淘汰。
- Rules 驗證合併後的資料契約，不能證明請求經過指定 transaction updater、UUID 全歷史唯一、或 owner 沒有刻意提交合法外觀的新操作。相同日期的新版本 + clock 是現有合法操作，不能只靠 Rules 辨識其意圖。更強的惡意 owner 威脅模型需要受控 server writer，詳見 `CUTOVER.md`。
- 日期規則限制 YYYY-MM-DD 格式與月／日範圍，不做完整閏年／月份天數曆法驗證；正常 UI 繼續使用既有日期驗證。UUID 正規式驗證格式，不是伺服器簽章。

最終 Head 的 GitHub checks 與 PR 描述會提供實際 CI 結果與連結；在 checks 完成前不能用基準 Head 的綠燈代替。本輪維持 Draft，Production 與真實全帳號重置仍 NO-GO。安全切換順序與最小後續隔離工作見 [CUTOVER.md](CUTOVER.md)。
