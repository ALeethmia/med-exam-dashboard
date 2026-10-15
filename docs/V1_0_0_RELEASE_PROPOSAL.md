# v1.0.0 — Chapter 1：初始之地｜發布候選

狀態：**發布候選 metadata／文件已準備，等待人工 Code Review，測試結果見 Draft PR／CI；未合併、未部署 Production、未建立 v1.0.0 Tag／GitHub Release。** 更新日期：2026-10-15。對應 [長期路線圖](FUTURE_DEVELOPMENT_ROADMAP.md) 與 [私人驗收保存清單](PRIVATE_PREVIEW_INVENTORY.md)。

## 已核對的正式狀態

| 項目 | 證據與結論 |
| --- | --- |
| main／PR #18／#19 | 兩個 PR 均已合併；前次 GO 審計與本次建立分支前重新核對 main 均為 `96ef25ec23fecd063f0871733a0081ce61833e78`，此為候選基準，不是將來 v1.0.0 Tag 的最終 SHA |
| PR #18 CI | 指定 Head `db94760d1db897d4e9a828f96275057f415770f6` 的 [CI](https://github.com/ALeethmia/med-exam-dashboard/actions/runs/38689581642) 全部成功；199 項單元、99 項 CI 瀏覽器／整合檢查。PR #18 已獲使用者人工 Code Review GO |
| Production | Vercel `dpl_HcaPoKH8CEYk1FBkKrV5CCNYc8iK` 為 READY、target production；Source SHA 與上述 main 相同，正式網域 [med-exam-dashboard.vercel.app](https://med-exam-dashboard.vercel.app/) 指向該部署，前次唯讀審計已核對；本版本 PR 不部署正式站 |
| 已執行的上線檢查 | 上一輪 PR #18 發布時：Preview 與 Production 各 32 個舊 URL＋32 個 canonical 資源均 HTTP 200、MIME／SHA256 相符；Production 1440／390／320px 的 21 項唯讀 Smoke Test 通過，無 404／pageerror／初始化錯誤。未以真實帳號操作 |
| 當前版號 | 分支 package／lock／建置產物統一為候選 1.0.0；正式站仍為 0.2.0。既有 [v0.2.0 正式 Release](https://github.com/ALeethmia/med-exam-dashboard/releases/tag/v0.2.0) 於 2026-10-12 發布並保持不變。建立分支前沒有 v1.0.0 Tag／Release 衝突 |
| 真實帳號驗收 | 使用者在最新 Production 完成並明確回報下列六項全部通過；這是使用者人工驗收，不是 Codex 自行操作真實帳號的端到端測試 |

使用者人工驗收回報：

1. 登入與同步狀態正常。
2. 課程進度與首次完成日期正確。
3. 今日任務與讀書計畫正常。
4. 領主等級、建築與編年史正確。
5. 歷史 XP、成就與既有紀錄保留。
6. 重新整理／跨裝置資料一致，沒有異常 pending。

前次唯讀發布審計為 **GO**，無已知新的發布阻擋。此輪只準備版本候選，仍需本 PR CI／Code Review；不把舊版的正式驗收冒稱尚未部署的 1.0.0 已上線。

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

## 版本規則

| 版本 | 定義 |
| --- | --- |
| v1.0.0 | 第一章正式穩定版；目前為候選，另獲發布授權後才發行 |
| v1.0.x | 相容性與錯誤修補，維持既有功能／資料契約 |
| v1.x.0 | 未來新增相容功能，仍需需求與授權 |
| v2.0.0 | 有實際重大不相容變更時才評估；不直接對應 Chapter 2 |

章節、產品版號與 Firebase Schema 各自獨立。升至 1.0.0 不代表資料路徑換成 v1.0，也不是遷移理由。

## 本次候選檢查與授權界線

- [x] 使用者回報最新 Production 六項真實帳號人工驗收通過，並完成 GO 唯讀審計。
- [x] 基準 main 一致，舊 v0.2.0 Tag／Release 保留，沒有 v1.0.0 衝突。
- [x] 授權限於版本 metadata、必要發行文件，以及單一目錄完整性測試的版本欄位正規化；依賴與產品邏輯不變。
- 本候選須通過 build／lint／unit／版本一致性、必要 Mock 瀏覽器測試與 GitHub CI；同一 Head 的實際結果以 Draft PR／CI 記錄為準。
- [ ] 使用者完成版本 PR Code Review，另行授權 Ready／Merge／Production 部署。
- [ ] 合併後確認 Production READY、正確 Source SHA／1.0.0 與唯讀 Smoke。
- [ ] 另行取得 v1.0.0 Tag／GitHub Release 授權後才執行。

未來的合併／部署或 Tag／Release 未執行，不預先勾選。文件中的人工驗收不擴張為所有失敗、日期競爭或實體裝置情境均已驗證。

## 已知限制與風險

1. 課程 bool 與首次日期並非跨路徑原子交易；多裝置有競爭窗口，需保留現有衝突／待核對提示，不宣稱已消除所有跨裝置競爭。
2. 舊分頁可能沿用舊獎勵行為；歷史 XP 不決定新領主等級，但不表示可以忽略學習寫入衝突。發行前保存未同步意圖、關閉舊分頁；未決獎勵保留、人工核對，不自動補發或刪除。
3. Mock 與 Linux Chromium 不能替代真實 Firebase、Mac 觸控板及實體手機驗收；未驗證範圍須公開記錄。
4. 本輪已更新 README、VERSIONING、CHANGELOG 的目前狀態；早期 `docs/growth-i1/RELEASE_REVIEW.md` 及階段回顧仍作歷史紀錄保留，不作目前阻擋結論，亦不把當時未驗證事項改寫成 Codex 已驗證。
5. 私人 `.site` 首頁仍指向 I3，且歷史 Fixtures 與正式 main 已有差異；只能作設計證據，不得稱作最新正式版或真實資料測試。

## 發行順序與尚未授權操作

1. 已取得六項人工驗收回報與 GO 審計，使用指定 main 基準建立版本分支；不要開始第二章或新功能。
2. 本輪建立單獨 Draft PR：同步 package／lock，使用既有 build 產生資訊，更新必要文件。另經明確授權僅調整 `tests/growth-i1/repository-layout.test.mjs` 的版本正規化，保留其他完整性檢查。執行既有必要測試後維持 Draft。
3. 執行必要既有 CI、Mock 與 Preview 驗證；審查通過並另獲授權後合併，確認 Production READY、Source SHA、正式頁尾版號與唯讀 Smoke。Git 整合可能自動部署 main，合併與發布不能視為純文件動作。
4. 部署／驗收確認後，在正確的已合併 Commit 建立 `v1.0.0` Tag 與非 prerelease 的 GitHub Release，附發行內容、驗收範圍及限制。不得把 Tag 指向舊 v0.2.0 Release 或未驗收的分支。
5. 進入維護，以 v1.0.x 處理實際 Bug；同一版本小修不自動啟動後續章節。

若出現資料風險，停止額外寫入與發布，保留 Firebase／Rules、歷史資料與本機 pending；先確認問題再提出修補或回退。回退只能選經核對資料契約相容的部署，不能直接回到仍會發獎的舊客戶端、還原整庫、清空待同步或重播 XP。若 v1.0.0 已發布，不移動既有 Tag 來掩蓋修正，改以新 patch 版本處理。

**結論：GO 審計及使用者六項驗收已完成，現準備 v1.0.0 Draft 候選；等待本 PR 測試／Code Review 與後續明確授權。v1.0.0 正式 Release 尚未發布。**
