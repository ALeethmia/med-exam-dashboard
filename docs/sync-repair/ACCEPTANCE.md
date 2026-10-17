> 後續部署前安全驗證：請一併閱讀 [CUTOVER.md](CUTOVER.md) 與 [RULES_SECURITY.md](RULES_SECURITY.md)。下文數字是第二輪同步修復基準，後續測試結果另列，不能視為正式 Rules 已部署。

# PR #26 · 第二輪驗收

Reviewed input: `00c28dea082707affef25726cc5c7605cee7b446`。比較基準 main: `faf357ceab5752c4399bd6712c68a9ad2b1c2587`。

本輪只更新既有 Draft PR。沒有 Merge、Release、Production 部署、正式 Rules 變更、真實 Firebase 資料讀寫或真實帳號重置。

## 寫入契約

課程完成與首次日期合併成 `users/<UID>/learningV3` 的一筆 transaction。它只包含該 UID 的四科課程、每課最後操作 UUID、首次日期／移除 tombstone、generation、era、clock；不再 transaction 資料庫根節點，也不讀寫 XP、任務、習慣或行事曆。章節跨科整批仍是一個 transaction。正常目錄 115 個課程，伺服器 metadata 隨課程數成長，不隨修改次數成長。

每筆新操作先用獨立 localStorage key 持久保存不可變的內容與 base revisions。不同分頁不再覆寫同一個 journal JSON。發送者透過短 IndexedDB critical section 取得帶 UUID 的 3 秒 claim；Web Locks 只減少重複工作；排程鎖使用 ifAvailable，舊分頁一直持鎖時仍走 IDB／CAS，不會等待網路鎖。SDK 呼叫期間不佔用 IDB transaction。其他分頁不能反覆搶走有效 claim，且租約到期只允許接管同一筆 CAS，絕不表示成功。遲到回覆仍須匹配 UID/session 以及仍存在的同一筆 journal。若 claim 已移交，只有 committed server snapshot 證明整批欄位全為該不可變操作 UUID，才可結案；其他回覆仍須匹配發送 claim。結案與 review 決策共用短本機互斥區，不會復活已刪除的 journal，也不會刪除後續 UUID。

SDK rejection 或 3 秒內沒有回覆都不能判定伺服器是否已寫入。停止等待只排程同一 CAS 的安全重試；舊 SDK 呼叫仍受不可變 bases、操作 UUID 與 session fence 約束，單一分頁也不會永遠等在原 Promise。重試相同不可變操作時，伺服器 transaction 檢查目前 revisions：

- 自己的 UUID 仍是操作中每個欄位的 revision：原操作已提交；相同 transaction 不增加 clock／日期，取得 committed server snapshot 後結案。
- bases 仍完全一致：原操作可安全提交。
- 其他裝置改過相同欄位：整批進入明確 review，不覆蓋較新的資料。這時無法由最後 revision 重建被覆蓋的歷史；不宣稱舊操作曾成功。使用者保留雲端或以新的 UUID 重新套用整批。其他不相干課程仍可同步。
- generation 不同：舊 request 保留到 retired journal，不可套用到重置後資料，也不阻擋新進度。

只有 committed transaction 的 server snapshot 可以把新 pending 自動當作成功結案；明確放棄衝突操作或由 generation fence 隔離舊操作，均不宣稱寫入成功。快取、Boolean 相等、連線狀態、逾時或普通 value listener 都不作成功證明。成功後先持久保存不可變 confirmed snapshot、更新顯示快取與日期，再刪除 journal；本機結案失敗可以重試，reload 則由同一 CAS 恢復。

confirmed snapshots 以 era/clock 選最新，正常保留最近兩份；延遲 callback 不可把投影倒退。離線完成後立刻編輯日期，新的日期 request 以待同步首次日期的投影 UUID 為 base；重連／reload 不會把同裝置的因果修改誤判為跨裝置衝突。首次日期由原始操作日決定，取消／重勾與重試不重設；手動移除保留 tombstone。沒有新 XP writer，也不重播舊獎勵。

## 舊程式與部署限制

`sync.js` 的舊課程 pending、v2 journal 及舊日期 pending 都保留。新操作不讀它們作為新基準、不重送、不依 Boolean 清除，也不讓它們阻擋新操作。舊 UI 決策按鈕對歷史課程 pending 停用；日後另行授權的重置才清除。

新的 read facade 將課程與日期讀取導向 canonical UID document，拒絕所有舊課程／日期寫入。writer 缺失時不啟用第二條 Boolean writer。

**重新整理、Service Worker 更新或頁面廣播不能淘汰舊客戶端。** 安全切換需要伺服器 root deny，移除所有 ancestor write grants，對新 UID document 和既有非課程路徑逐一授權，並永久拒絕舊四科、舊日期及 v2 gate 路徑的寫入。`tests/fixtures/course-rules.json` 只適用合成 UID `fixture-A` 的隔離 Emulator；不是可直接部署的正式 Rules。

還有一個重置限制：舊非課程程式仍使用相同 shared 生活／任務路徑，無法只靠前端版本保證它們不在重置後回寫。真實全帳號重置必須先獨立證明這些 writer 已被伺服器淘汰，或另行審查其寫入契約。若要保證全帳號重置，必要方向是讓生活／任務寫入也使用受伺服器驗證的 UID＋generation 新路徑（或受控 server writer），並永久 deny 舊 shared roots；相同 UID、相同舊路徑的請求無法僅憑前端版本分辨。這輪不擴張成所有生活資料的架構遷移。正式切換、初始化／重置 fence 與真實重置皆仍 NO-GO。

## 驗證與界線

同一容器、Chromium、2 workers、196 個共同測試，分別使用原始 worktree，沒有修改 main 或 reviewed head 測試：

| 版本 | Passed | Failed | Skipped |
|---|---:|---:|---:|
| main `faf357c` | 109 | 87 | 0 |
| reviewed `00c28de` | 110 | 86 | 0 |

共同通過 109，兩者都失敗 86，main 通過而 reviewed 失敗 **0**。main 額外一項 training reconnect 的操作 timeout，在 reviewed 通過。先前 111／85 不能當作這次配對重跑結果；差異包含非穩定的計時／測試環境失敗。逐項分類與最終結果見 [BROWSER_COMPARISON.md](BROWSER_COMPARISON.md)。

故障注入涵蓋提交前後 rejection、遺失 ack 後 reload、local quota／結案失敗、延遲 Promise、同 UID 多分頁／混合 Web Locks 支援、ABA、不同裝置整批衝突、UID/session fence、manual date tombstone、reset generation 與 200 輪修改。原生 IndexedDB 測試與真正 index/auth/workspace 的 checkbox、chapter 操作都有覆蓋，不能以獨立函式測試取代。

Emulator 使用 checksum 固定的 SDK 9.22.0／Database Emulator 4.11.2，僅 loopback transport，合成 Auth identities 與隔離 Rules。驗證舊 root multi-update 全部拒絕、其他 UID 保持原值、禁止一般客戶端改 generation／刪 fence。真實手機、跨瀏覽器儲存驅逐、無限期斷網、永久拒權或使用者清空網站資料不在自動恢復保證內。無 Web Locks 時使用原生 IDB；兩者皆不可用時保留 pending 並提示本機儲存協調失敗，絕不假造成功。

## 建議

保持 Draft，交由 ChatGPT 再審。正式上線 **NO-GO**，直到正式 Rules／舊 writer 淘汰與切換步驟經另一次審查和授權，且最終 CI 與完整產品測試結果確認可接受。一次性重置僅規劃與合成測試，不含執行入口。

## 最終本機結果

- 完整 Playwright：201 passed / 0 failed / 0 skipped（2 workers，同一容器）。
- npm test：全部通過；展開執行 224 項檢查。
- build、lint：通過。
- 真實 Becoming + SDK Emulator：12 / 12；既有 Adapter SDK Emulator：5 / 5。
- canonical auth：6；review browser：48；failure/batch：8；learning：14，均通過。
- 相容網址：32；browser module/layout：18，無錯誤。
- CI 已從子集提升為完整 201 項瀏覽器套件；新 Head 的 CI 結果以 PR checks 為準。
