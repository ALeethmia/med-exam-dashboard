# Changelog

產品版本採 Semantic Versioning。以下是待驗收的預發布內容，不代表已建立 Tag、GitHub Release 或正式發布；沒有回填未知發布日期。

## [0.2.0-beta.1] — Phase 2A 預發布（待驗收）

### Added

- Aetheria（艾瑟利亞）世界與第一章「學者的試煉」，唯讀王國與現實目標摘要。
- 領主檔案與「我的編年史」，保留已有成就與歷史獎勵。
- 成長統計：課程首次完成紀錄、累積課程進度、次要 Planner 摘要，以及運動與恢復。
- 四科單元首次完成日期：新勾選記錄台灣日期，支援手動設定、修改與移除。
- 建置產生的頁尾版本資訊與輕量版本一致性檢查。

### Changed

- Quest OS 對外更名為 Becoming；首頁維持國考任務與學習進度核心。
- 舊角色與成就入口整合至王國編年史；舊 progression 入口保留導向相容性。
- 無 Planner 任務不再顯示容易誤解的 0/0；週次趨勢圖保留於週計畫頁。

### Fixed

- 首次課程統計排除 Planner、時間目標及無效課程獎勵；取消／重勾不重複計數。
- 移除日期後不從舊獎勵或重勾恢復日期，跨裝置修改衝突保留明確選擇。

### Data compatibility

- 保留原四科 ID／完成狀態、八堂固定生化課、16 週計畫、Planner v3、生活目標與運動歷史。
- 舊 XP、awards、achievements 與冪等發放邏輯不遷移、不清空，也不換算成王國資源。
- 新課程日期路徑：`questOS/v1/courseFirstCompletion/{path__id}`，欄位為 `day` 與 `_version`；移除保留空日期版本標記。舊完成日期不推測回填。
- `questOS/v1`、`gamification/v1`、`gamification/v3` 等 Schema 路徑與產品版號分離，品牌或版本更名不造成搬移。
- 正式 Firebase 的授權、跨裝置同步與離線衝突仍需本人實際驗收，Mock 測試不代表正式驗收。
