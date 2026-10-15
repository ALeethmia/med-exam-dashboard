# Chapter 1 v1.0.0 發行提案

狀態：**提案，尚未決定發行、未改版本、未建立 Tag／Release**。盤點日期：2026-10-15。對應 [長期路線圖](FUTURE_DEVELOPMENT_ROADMAP.md) 與 [私人驗收保存清單](PRIVATE_PREVIEW_INVENTORY.md)。

## 已核對的正式狀態

| 項目 | 證據與結論 |
| --- | --- |
| main／PR #18 | [PR #18](https://github.com/ALeethmia/med-exam-dashboard/pull/18) 已於 2026-10-15 合併；main 為 `f46468dd81cd7d37fef722db113e54fdd68a6be1`，本輪重新查詢相同 |
| PR #18 CI | 指定 Head `db94760d1db897d4e9a828f96275057f415770f6` 的 [CI](https://github.com/ALeethmia/med-exam-dashboard/actions/runs/38689581642) 全部成功；199 項單元、99 項 CI 瀏覽器／整合檢查。PR #18 已獲使用者人工 Code Review GO |
| Production | Vercel `dpl_DJKKmWx1srUeEQmJXUgn4eujwGke` 為 READY、target production；Source SHA 與上述 main 相同，正式網域 [med-exam-dashboard.vercel.app](https://med-exam-dashboard.vercel.app/) 指向該部署，本輪重新核對 |
| 已執行的上線檢查 | 上一輪 PR #18 發布時：Preview 與 Production 各 32 個舊 URL＋32 個 canonical 資源均 HTTP 200、MIME／SHA256 相符；Production 1440／390／320px 的 21 項唯讀 Smoke Test 通過，無 404／pageerror／初始化錯誤。未以真實帳號操作 |
| 當前版號 | 本輪 GET 正式 `public/app-version.json` 為 `0.2.0`，commit 同 main；package／lock 為 0.2.0。GitHub 已有 [v0.2.0 正式 Release](https://github.com/ALeethmia/med-exam-dashboard/releases/tag/v0.2.0)，發布於 2026-10-12；不是尚未建立 Release |
| 真實帳號驗收 | 使用者先前已回報 PR #15 部署後真實帳號驗收通過，且核對過正式 Rules 的資料庫執行個體／已發布狀態／UID 一致。**PR #18 部署後的真實帳號與跨裝置驗收尚未收到明確完成回報**；不能由舊回報或 Mock 測試推定已完成 |

因此：PR #18 已完成部署與自動／唯讀技術驗證；v1.0.0 仍須確認下列必要驗收及另行取得發行授權。此輪沒有新的程式故障證據，也沒有把文件提案等同正式上線批准。

## 為何可考慮以 v1.0.0 定義第一章穩定版

核心使用情境、Lite 美術、成長公式與 Design A 已定案並進入維護；同步安全修補、資料格式相容及 B 方案分類已經審查與部署。v1.0.0 可明確表達「第一章的穩定使用契約」，與早期 0.x 原型區分，而不是為了增加功能或重設資料。

穩定不等於零風險或完整 RPG；它表示目前醫師一階國考工作流程有明確驗收、相容性承諾、已知限制與安全維護方式。第二章、App 安裝及 C 方案均不列入本次發行條件。

## 擬發行內容與不變契約

- 現有登入、學習 Dashboard、課程進度／日期、今日任務、讀書計畫與生活／訓練功能。
- Chapter 1「初始之地」Lite SVG 王國、三棟建築 I–V、領主與相鄰編年史、多建築展開、階段預覽、手機布局、一般頁面滾動與地圖縮放分離。
- 領主 Lv.1–20：既有 40／40／20 王國進度公式；即時計算，取消成果可能降級，不保留舊 XP 等級下限。
- Design A：課程完成紀錄為課程型任務的唯一完成來源；一般任務獨立。沿用 Growth I1 新版任務停止發 XP 的決策，**不重新啟用早期獨立領取 20 XP 提案**。
- 保存歷史 XP、成就／編年史、學習紀錄及待核對獎勵；不刪除、補發或自動遷移，不新增 Firebase 欄位或 Rules。
- loading／ready／error／signedOut、UID 隔離、重連／pending 及衝突提示；保留舊公開 JS／CSS URL 的相容契約。

## 版本規則（提案）

| 版本 | 定義 |
| --- | --- |
| v1.0.0 | 第一章正式穩定版，通過本文件驗收後才另行發行 |
| v1.0.x | 相容性與錯誤修補，維持既有功能／資料契約 |
| v1.x.0 | 未來新增相容功能，仍需需求與授權 |
| v2.0.0 | 有實際重大不相容變更時才評估；不直接對應 Chapter 2 |

章節、產品版號與 Firebase Schema 各自獨立。升至 1.0.0 不代表資料路徑換成 v1.0，也不是遷移理由。

## 發行前必要驗收

- [ ] 使用者確認 PR #18 正式版的登入、科目、任務、讀書計畫、訓練、編年史與王國正常；在慣用桌機／手機完成日常使用檢查。
- [ ] 由使用者自行選擇可安全核對的課程，確認科目／今日任務兩入口的完成與取消顯示一致，多課程任務及一般任務符合原規則；沒有新增任務 XP，歷史 XP 仍可見。
- [ ] 由使用者確認日期寫入失敗／待重試提示、重新登入、離線恢復及實際跨裝置使用符合預期；先保存未同步操作、關閉舊分頁，不清空 pending。高風險競爭測試先用 Mock／隔離測試替身，不為驗收破壞真實紀錄。
- [ ] 核對本輪提出的已知限制與待核對獎勵處理方式可接受；若 Rules／部署設定自前次使用者確認後有變更，另行核對，毋須在文件提供 UID 或憑證。
- [ ] 發行候選的確切 Commit 與 CI／必要 Mock 回歸、資源相容及 Production Smoke 證據一致，無新的學習資料遺失、登入隔離、主要讀書功能或權限不相容阻擋。
- [ ] 使用者明確批准「將 Chapter 1 定義為 v1.0.0」以及後續版本 PR、合併／部署、Tag／Release 的具體操作範圍。

上述真實資料項目由使用者自行操作並回報；本輪不登入、讀取或匯出真實紀錄。不能勾選尚無證據的項目。

## 已知限制與風險

1. 課程 bool 與首次日期並非跨路徑原子交易；多裝置有競爭窗口，需保留現有衝突／待核對提示，不宣稱已消除所有跨裝置競爭。
2. 舊分頁可能沿用舊獎勵行為；歷史 XP 不決定新領主等級，但不表示可以忽略學習寫入衝突。發行前保存未同步意圖、關閉舊分頁；未決獎勵保留、人工核對，不自動補發或刪除。
3. Mock 與 Linux Chromium 不能替代真實 Firebase、Mac 觸控板及實體手機驗收；未驗證範圍須公開記錄。
4. `VERSIONING.md`、`CHANGELOG.md`、README 與早期 `docs/growth-i1/RELEASE_REVIEW.md` 仍有「待發布／Draft／NO-GO」及舊階段描述；屬歷史文件狀態，不作目前部署結論。正式版本 PR 應更新現況與 Release Notes、明確保留歷史上下文，不能假造過去驗收。本輪不更動這些舊文件或版本。
5. 私人 `.site` 首頁仍指向 I3，且歷史 Fixtures 與正式 main 已有差異；只能作設計證據，不得稱作最新正式版或真實資料測試。

## 未來最小發行順序（需另行授權）

1. 收集上述人工驗收回報、確認沒有新的資料安全阻擋，選定 main 基準與維護窗口；不要開始第二章或新功能。
2. 建立單獨版本 PR：同步 package／lock 版本、經既有 build 產生版本資訊，更新 VERSIONING／CHANGELOG／必要 README。只涵蓋發行 metadata 與文件，無破壞性資料遷移；此輪未執行。
3. 執行必要既有 CI、Mock 與 Preview 驗證；審查通過並另獲授權後合併，確認 Production READY、Source SHA、正式頁尾版號與唯讀 Smoke。Git 整合可能自動部署 main，合併與發布不能視為純文件動作。
4. 部署／驗收確認後，在正確的已合併 Commit 建立 `v1.0.0` Tag 與非 prerelease 的 GitHub Release，附發行內容、驗收範圍及限制。不得把 Tag 指向舊 v0.2.0 Release 或未驗收的分支。
5. 進入維護，以 v1.0.x 處理實際 Bug；同一版本小修不自動啟動後續章節。

若出現資料風險，停止額外寫入與發布，保留 Firebase／Rules、歷史資料與本機 pending；先確認問題再提出修補或回退。回退只能選經核對資料契約相容的部署，不能直接回到仍會發獎的舊客戶端、還原整庫、清空待同步或重播 XP。若 v1.0.0 已發布，不移動既有 Tag 來掩蓋修正，改以新 patch 版本處理。

**提案結論：可準備 Chapter 1 v1.0.0 發行決策，但目前尚待 PR #18 後人工使用確認與明確發行授權；不宣稱 v1.0.0 已發布。**
