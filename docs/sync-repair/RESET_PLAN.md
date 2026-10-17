> 本輪新增：[內建重置與最短 Spark 首次切換](SELF_SERVICE_RESET.md)。使用者確認後由 Rules 受限地原子輪換 fence；舊受管工具不再是首次上線的必要前置。以下保留原流程與歷史限制。

# 空白帳號初始化與重置（僅離線計畫／合成測試）

正式順序以 [CUTOVER.md](CUTOVER.md) 為唯一操作清單；七組隔離契約見 [LIFE_ISOLATION.md](LIFE_ISOLATION.md)。使用者決定未來不保留舊紀錄，**不等於已授權執行**。本輪不讀寫真實資料，不做 Legacy Migration。

## 離線 artifact

`src/study/reset-plan.js` 沒有 Firebase、Auth、網路或 apply/delete API：

- `createResetPlan`：列出該 UID 的 scoped cloud／local 備份、SHA-256、fence 規劃與 blockers，固定 `executable:false`。
- `verifyResetBackup`：驗證 artifact hash、UID 及 scope。它不能確認輸入來自 server、資料完整或已凍結，也不是整個 instance 的備份工具。
- `createBlankAccountPlan`：以同一份 frozen `cloudSnapshot`、`verifiedUID === ownerUID`、UID local snapshot 與逐路徑確認過的 `reviewedLegacyPaths` 產生 `atomicUpdate`。新 course／life generation 預設各用獨立 UUID；拒絕當前值、已見 life namespace、初始／佔位值與不安全 era。跨次匯出／歷史備份的全域不重用仍須管理端審查。任何 artifact 都需要重新生成、核對 exact Head、完整 snapshot hash、patch hash 與兩份授權，不能直接匯入 Console。

## 空白狀態

管理端在同一次原子更新中建立：

- `users/<UID>/learningV3`：schema 3、唯一新 generation、首次 era 0（已有則嚴格 +1）、clock 0，courses／versions／firstCompletion 空。RTDB 會省略空 maps；四個 fence 欄位持久化即合法空白文件。
- `users/<UID>/lifeControl`：schema 1、另一個唯一新 generation、首次 era 0（已有則嚴格 +1）。管理端唯寫，永不刪除或回到初始值。
- `users/<UID>/lifeV1/<generation>`：邏輯空白；RTDB 不保存空物件，所以此節點讀到 null 正常。當前 generation 由 control 指定，第一筆合法 bucket 寫入才建立實體節點。不增加 Store 不認識的 sentinel。

七組來源、課程與日期讀新位置；XP 仍讀 `gamification/v1/days`／`awards`，所以空白開始必須在獨立 reset 授權與歸屬核對後處理這兩個 shared 來源，否則舊 XP 仍會顯示。新課程與任務依既有契約不再產生 XP；從 0 開始後 XP 維持 0 是預期，王國按課程／活動證據成長。

## 精確範圍

計畫中的 legacy scope 是 `RESET_CLOUD_PATHS`：四科根、歷史 XP days／awards、timeTasks、planner/tasks、habits、舊首次日期、training、adaptive settings、舊 v2 gate、custom_events、checklist。只對 snapshot 中存在且**逐一路徑確認歸屬**的項目產生 null；未知 shared 子資料不可以直接認作 owner 所有。若部分子樹有其他使用者或定義，停止並縮小另行審查的 reset scope，不套用整根刪除計畫。

其他 UID、Auth、整個 `questOS`／`gamification`／`users` 根、課程定義不在 atomicUpdate 中。舊 life generations 可保留於 server 備份，Rules 不再允許一般客戶端讀寫。該 UID local keys 的清理清單獨立列出，須在 reset 授權下處理包含課程 journal／retired pending 的精確 keys；不清整個 origin、不碰其他 UID 或 Auth persistence。離線裝置未清的舊意圖仍由課程 fence／life generation 阻擋，不能以清本機代替 server 隔離。

## 授權與復原

一般部署不可自動建立空白來源，即使不物理刪 legacy 也會實質放棄進度。沒有獨立 reset 授權時保持準備階段。正式管理操作另需最小 scope 的 Rules／資料變更權限；本 helper 永不因傳入旗標而變成可執行。

完整 server JSON、Rules 原文、匯出 metadata／SHA-256、凍結後最終快照與隔離還原驗證都是前提。失敗維持 freeze／維護，不回復舊寫入；沒有相容回復 build 時不恢復正常編輯。備份還原須另外授權、保全新成功紀錄並使用新 generation／遞增 era，不能照舊備份倒退 fence。
