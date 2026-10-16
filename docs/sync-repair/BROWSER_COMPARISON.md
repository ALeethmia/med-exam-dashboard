# 瀏覽器配對比較與最終結果

2026-10-16（台灣）。原始 worktree 配對執行，Chromium、同容器、2 workers、30 秒 test timeout；未修改 main 或 reviewed head。外部請求封鎖，合成 Firebase／本機資料。

| 版本 | Passed | Failed | Skipped |
|---|---:|---:|---:|
| main faf357ceab5752c4399bd6712c68a9ad2b1c2587 | 109 | 87 | 0 |
| reviewed 00c28dea082707affef25726cc5c7605cee7b446 | 110 | 86 | 0 |
| 最終分支（含 5 項新增 durable UI 測試） | 201 | 0 | 0 |

共同通過 109、共同失敗 86、main 通過但 reviewed 失敗 0；一項 main 獨有 timeout。此統計只涵蓋原 196 個共同案例；新增的持鎖分頁故障測試另行在修正前實測失敗、修正後通過，證明並修復舊分頁的排程 Web Lock 阻擋活躍 writer 的缺陷。原 111／85 沒有可配對的同環境 main 報告，這次不沿用它當比較數字。所有 87 個 main 失敗均列在下面，而非直接推定為舊問題。

修正過程完整套件中間結果包括 149／51、188／12、197／3；fixture 變數與時序引入的中間 regression 已列入修復，最終結果不混入中途結果。沒有 skip、刪除失敗案例或降低期望 timeout。

測試假設更新保留重要行為：UID 隔離沒有取消；XP 從「新任務再發獎」改驗證「歷史不變、新任務不發」；課程型任務驗證實際關聯；收合的建築資訊先展開再驗證同樣的數值／路線；對齊 CSS 明確讓兩卡獨立長高，因此驗證上緣對齊、無遮蔽與內容界線，不再要求相等高度。新增非同步 journal 結案後才比較唯讀快照。

分類統計：既有失敗／過時 UID fixture 25；既有失敗／Mock 與重連時序 7；既有失敗／過時 UID 與獎勵假設 5；既有失敗／過時 Auth 假設 2；既有失敗／過時寫入契約假設 1；既有失敗／過時 UI 與資料假設 39；既有失敗／過時 UI 假設 7；環境／計時失敗 1。

| 案例 | 分類／處理 | main | reviewed | 最終 |
|---|---|---|---|---|
| adaptive.spec.js:priority/date edits and reschedule previews cancel with identical persisted data | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:confirmed distribution honors priorities, original dates and XP, and does not complete linked courses | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:waiting tasks retain legal dates, reappear via explicit scheduling and remain separate from fixed biochemistry | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:unknown work and overload remain visible; no fake feasible plan or automatic rest-day changes | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:locked task is excluded while known time conflicts with fixed classes are rejected in task editor | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:mobile capacity and preview fit in light appearance | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:mobile capacity and preview fit in dark appearance | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:mobile capacity and preview fit in system appearance | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:mock cloud batch survives offline reload and commits both dates in one transaction on reconnect | 既有失敗／Mock 與重連時序。補齊 UID seed、off、transaction.committed；等待 readiness，修復重連 retry 遺漏。 | failed | failed | passed |
| adaptive.spec.js:remote completion stops all offline moves and explicit withdrawal preserves latest completion and XP | 既有失敗／Mock 與重連時序。補齊 UID seed、off、transaction.committed；等待 readiness，修復重連 retry 遺漏。 | failed | failed | passed |
| adaptive.spec.js:capacity conflict compares meaningful local/cloud values and adopting cloud preserves the remote exam date | 既有失敗／Mock 與重連時序。補齊 UID seed、off、transaction.committed；等待 readiness，修復重連 retry 遺漏。 | timedOut | failed | passed |
| adaptive.spec.js:no-estimate preview dates can be edited; rest dates rejected and custom estimate survives commit | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| adaptive.spec.js:weekly task removal needs no confirmation, preserves data and XP, and supports undo for unfinished and completed tasks | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | timedOut | timedOut | passed |
| adaptive.spec.js:weekly task removal queues offline and synchronizes its tombstone on reconnect | 既有失敗／Mock 與重連時序。補齊 UID seed、off、transaction.committed；等待 readiness，修復重連 retry 遺漏。 | timedOut | failed | passed |
| adaptive.spec.js:removal of an existing timed conflict succeeds while undo still checks its time slot | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | timedOut | timedOut | passed |
| adaptive.spec.js:remove sits on the right and uses theme error colour at 390px | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | timedOut | timedOut | passed |
| adaptive.spec.js:remove sits on the right and uses theme error colour at 1280px | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | timedOut | timedOut | passed |
| adaptive.spec.js:recently removed entry survives reload and restores completed and waiting tasks without XP changes | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | timedOut | timedOut | passed |
| adaptive.spec.js:cloud removed tasks remain recoverable after reload and restoration syncs on reconnect | 既有失敗／Mock 與重連時序。補齊 UID seed、off、transaction.committed；等待 readiness，修復重連 retry 遺漏。 | timedOut | failed | passed |
| course-dates.spec.js:old completions stay undated until explicitly entered and old award date can be removed without changing award | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| dashboard.spec.js:planned tasks award XP once and never change course completion | 既有失敗／過時 UID 與獎勵假設。歷史資料種植至 UID scope，驗證歷史 XP 不變；新任務不得再發 XP。Mock 補齊 once、off、committed 與路徑訂閱通知。 | failed | failed | passed |
| dashboard.spec.js:all subjects keep search, filters, item checks and batch operations | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| dashboard.spec.js:midnight in Taipei refreshes daily tasks and habit date bindings | 既有失敗／過時 UID 與獎勵假設。歷史資料種植至 UID scope，驗證歷史 XP 不變；新任務不得再發 XP。Mock 補齊 once、off、committed 與路徑訂閱通知。 | failed | failed | passed |
| dashboard.spec.js:mock Firebase keeps unrelated records and confines XP to its namespace | 既有失敗／過時 UID 與獎勵假設。歷史資料種植至 UID scope，驗證歷史 XP 不變；新任務不得再發 XP。Mock 補齊 once、off、committed 與路徑訂閱通知。 | failed | failed | passed |
| dashboard.spec.js:Google login gates database access and exposes UID without clearing progress | 既有失敗／Mock 與重連時序。補齊 Auth mock 的 off 以完成登出清理／reload；維持登入前零資料讀取、登出隔離與舊紀錄不變。 | failed | failed | passed |
| dashboard.spec.js:cloud access rejects an account when owner UID is unset | 既有失敗／過時 Auth 假設。登出身份明確為 null；保留未授權帳號 databaseCalls=0、signOut、無 studyData 與原始 cache 不變。 | failed | failed | passed |
| dashboard.spec.js:cloud access rejects an account when owner UID is different | 既有失敗／過時 Auth 假設。登出身份明確為 null；保留未授權帳號 databaseCalls=0、signOut、無 studyData 與原始 cache 不變。 | failed | failed | passed |
| dashboard.spec.js:planner selects across subjects, keeps task and course completion separate, and locates the course | 既有失敗／過時寫入契約假設。新任務不發 XP；課程型任務透過唯一課程 writer 更新；歷史 XP 不變，保留持久化與關聯檢查。 | failed | failed | passed |
| dashboard.spec.js:free tasks retain ID through edits, ordering, postponement and deletion; copying starts a new activity | 既有失敗／過時 UID 與獎勵假設。歷史資料種植至 UID scope，驗證歷史 XP 不變；新任務不得再發 XP。Mock 補齊 once、off、committed 與路徑訂閱通知。 | failed | failed | passed |
| dashboard.spec.js:legacy time goals and course awards retain XP and readable history | 既有失敗／過時 UID 與獎勵假設。歷史資料種植至 UID scope，驗證歷史 XP 不變；新任務不得再發 XP。Mock 補齊 once、off、committed 與路徑訂閱通知。 | failed | failed | passed |
| dashboard.spec.js:same-field conflicts display both versions and resolve only after a user chooses | 既有失敗／Mock 與重連時序。補齊 UID seed、off、transaction.committed；等待 readiness，修復重連 retry 遺漏。 | failed | failed | passed |
| growth.spec.js:growth separates current scheduled task completion from reward history and dated recovery | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:lord identity and accessible chronicles entry work without exposing personal account data at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:lord identity and accessible chronicles entry work without exposing personal account data at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:growth empty states and historical pause limitations are explicit | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:single week trend stays in plan and all three course basis notes agree at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:single week trend stays in plan and all three course basis notes agree at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:dated course-only records remain stable on cancel and recheck and exclude Planner/time rewards | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| growth.spec.js:remote and offline course award snapshots count stable IDs once without creating new rewards | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| kingdom-map.spec.js:滾輪縮放有邊界，拖曳建築不會選取，點擊與鍵盤可操作 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | failed | failed | passed |
| kingdom-map.spec.js:預覽沒有持久化寫入或業務初始化，重新載入清除模擬 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | failed | failed | passed |
| kingdom-map.spec.js:macOS Chrome 回報情境：拖曳 SVG 文字不反白，地圖外仍可選取與複製 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | failed | failed | passed |
| kingdom-map.spec.js:地圖滑鼠操作不留下上下焦點藍線，Tab 仍有清楚焦點提示 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | timedOut | timedOut | passed |
| kingdom-map.spec.js:Chrome wheel 模擬：雙指滑動優先平移，捏合與滑鼠模式縮放 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | failed | failed | passed |
| kingdom-map.spec.js:滑鼠冷啟動點擊地圖與建築沒有原生矩形框，選取與 Tab 焦點不同 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | timedOut | timedOut | passed |
| kingdom-map.spec.js:觸控板捏合靈敏度提高為 1.5 倍，普通滾輪與按鈕速度不變 | 既有失敗／過時 UI 假設。驗證實際 ellipse ground 與來源階段標籤；普通滾輪仍捲頁，明確 zoom 模式與 Ctrl／鍵盤保留驗證。 | failed | failed | passed |
| kingdom.spec.js:Becoming brand and read-only kingdom enter, leave and reload without changing learning records or awards | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom exam date follows Planner settings without auto-passing after the exam | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| kingdom.spec.js:kingdom fits 390px in light appearance | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom fits 390px in dark appearance | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom fits 390px in system appearance | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom fits 1440px in light appearance | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom fits 1440px in dark appearance | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom fits 1440px in system appearance | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:kingdom reads cloud updates and offline legacy records without writing new namespaces | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:chronicles retain unlocked achievements and historical XP while home has no character UI at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:chronicles retain unlocked achievements and historical XP while home has no character UI at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:legacy progression saved opens kingdom chronicles and preserves awards | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:legacy progression hash opens kingdom chronicles and preserves awards | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:legacy progression query opens kingdom chronicles and preserves awards | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| kingdom.spec.js:legacy progression call opens kingdom chronicles and preserves awards | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| life.spec.js:daily goals read the actual Planner date; leisure and time goals leave XP and courses alone | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| life.spec.js:legacy exercise and rest remain visible without invented actions or migration writes | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| life.spec.js:life goal date bindings follow Taiwan midnight without losing yesterday | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| life.spec.js:legacy weekly schedule offers a draft comparison and upgrades only on save | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| life.spec.js:stage suggestions follow stages and saving an unchanged suggestion does not make it custom | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| life.spec.js:settings drafts including start, stage, mode and preset cancel without any local data changes | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| life.spec.js:moving from a started source into a completed target preserves source and archives target on confirmation | 既有失敗／過時 UID fixture。測試資料放入已驗證 UID 的 storage，未放寬產品隔離；保留原日期、獎勵、操作及跨重載驗證。 | failed | failed | passed |
| rpg-ux.spec.js:compact guild pass, three chronicles views and unchanged territory values at 320px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| rpg-ux.spec.js:compact guild pass, three chronicles views and unchanged territory values at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| rpg-ux.spec.js:compact guild pass, three chronicles views and unchanged territory values at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| rpg-ux.spec.js:chronicles keyboard tabs and refresh keep original awards and default collapsed detailed history | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:territory stages and keyboard details explain real evidence without storage writes at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:territory stages and keyboard details explain real evidence without storage writes at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:cancelled courses lower current buildings while explicit first dates remain history and old XP is unchanged | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep keeps both route calculations optional and recent results unique at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep keeps both route calculations optional and recent results unique at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep study only shows only the genuinely attained route | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep cross only shows only the genuinely attained route | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep highest study only shows only the genuinely attained route | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep highest cross only shows only the genuinely attained route | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:undated achievements are labelled and follow dated history without current milestones | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:four of 115 courses shows six-unit next target with two remaining and three-layer UX at 390px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:four of 115 courses shows six-unit next target with two remaining and three-layer UX at 1440px | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:keep nearest construction condition still requires both parts of the cross-domain route | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| territory.spec.js:highest academy and barracks stop promising a next upgrade | 既有失敗／過時 UI 與資料假設。UID 內種植合成紀錄；保留數值、日期、XP、鍵盤、唯讀與無溢出驗證；使用目前詳細資訊位置。 | failed | failed | passed |
| life.spec.js:mock Firebase persists training offline through reload and reconnect without touching XP or study data | 環境／計時失敗。原 main 操作按鈕等待 timeout；相同環境 reviewed 與最終版通過。未據此宣稱產品修復。 | timedOut | passed | passed |

原始失敗訊息摘要與機器可讀結果：[BROWSER_COMPARISON.json](BROWSER_COMPARISON.json)。

額外驗證：npm test、build、lint；原生 IDB 多分頁／quota／離線與真實課程操作；合成 SDK Emulator 11 項（含永久無回覆、延遲 proof、Rules 拒絕舊 writer 與 reset fence）；canonical auth 6、review browser 48、failure/batch 8、learning 14。CI 實際結果以 PR checks 對應 Head 為準。
