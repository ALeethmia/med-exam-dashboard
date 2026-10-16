# 一次性重置：只規劃與合成測試

最新 Rules 候選、七組 shared writer 隔離阻擋、freeze／切換／復原順序見 [CUTOVER.md](CUTOVER.md)。候選已禁止舊課程／日期／v2 與 v1 歷史 XP 帳本寫入，但生活／任務 shared roots 尚未隔離，不能執行全帳號重置。

沒有連線或重置任何真實帳號。`src/study/reset-plan.js` 只有備份範圍、SHA-256 與身分驗證；沒有 Firebase、Auth、storage apply/delete API，輸出固定 `executable:false`。

1. 先審查／驗收同步契約與伺服器舊 writer 淘汰方案。不能以要求關閉分頁或刷新 Service Worker 作保證。舊課程／日期／v2 路徑必須永久 deny；shared 生活與任務路徑的舊 writer 也須獨立證明已淘汰，否則禁止真實重置。
2. 取得新的明確執行授權，驗證 Auth UID 等於 owner UID。審查 shared root 子資料的實際歸屬；不能假設 root 全屬於該帳號。
3. 逐路徑備份四科歷史、獎勵／任務、習慣、日期、運動、容量、行事曆、自訂清單及舊 v2 gate，另備份精確 `users/<UID>/learningV3`。本機只列該 UID prefix 下的全部 key，包含 v1/v2/v3 pending、retired 與 snapshots。不得清空整個 origin、其他 UID 或 Auth persistence。
4. 驗證備份 checksum、內容、UID，實際演練還原。備份不等於可執行授權。
5. canonical document **不可刪除後重建成 initial generation**。需以新的唯一 generation、嚴格遞增 era、clock 0 與空進度，原子替換同一 UID document。普通客戶端 Rules 不可改 generation／era 或刪除此 fence。工具中的 `REQUIRES_FRESH_REVIEWED_GENERATION` 只是人工審查佔位符，不能拿來重複使用。
6. 舊 request 的 generation 不符就不能通過 CAS。清理該 UID 本機歷史 pending 必須是獨立授權重置的一部分；正常同步期間不刪歷史 pending。其他 UID、靜態課程定義、正式網站版本及 Auth 身分均保留。
7. 真實執行前仍需明確的還原方法與驗證門檻。這輪只在獨立 Emulator 模擬 fence、延遲舊 request、重置後重新建立進度與 reload，不提供真實執行工具。

課程契約的 generation 能防止課程復活；它不能自動淘汰仍可寫 shared 非課程 root 的舊程式。因此不能把本輪合成課程 reset PASS 說成整個真實帳號已可安全重置。
