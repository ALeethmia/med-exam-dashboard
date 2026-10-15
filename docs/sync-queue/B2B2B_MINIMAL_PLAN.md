# B2-B.2b 最小接續計畫（未授權實作）

1. **先完成群組派送契約，仍隔離**：整組 atomic claim、每個 path blocker、immutable group token、一次 root update 的原 Promise、原子 settle＋逐筆最新 generation CAS。不允許部分 members 重新組成另一個未授權 batch。
2. **日期橋接先證明持久接受**：重用正式 firstOnly／版本與移除標記規則，明確區分保存失敗與已存在、跨午夜原動作日期、重啟後 handoff 重試，以及成功接受但 ack 失敗。不能將 void 回傳當 receipt；無法安全保留原語意就維持阻擋。
3. **正式啟用另行審查**：單一 writer、所有 UI await 保存契約、非課程分流、UID scoped 備份、受控 legacy 切換、離線意圖發送資格、未知 group 恢復與 Safari 實機驗收。這些不在 B2-B.2a 接線範圍。

必要驗收：

- 一次群組只呼叫 SDK update 一次；重連不加送。
- 權限拒絕任一葉節點時整組 Emulator 測試；不能以 RAM 模型宣稱已通過真 SDK／伺服器群組驗證。
- 部分 member 在 claim 前／確認前被新 generation 取代時，舊證據不能刪新意圖。
- 群組 claim／settle abort、owner 關頁／UID 切換、已確認但本機尚未結案，均有持久恢復及保守未知政策。
- 日期 sink 去重證據及交接確認錯誤／重啟；無真實 XP／日期／legacy 副作用。
- B2-A、B2-B.1、B2-B.2a 及正式同步 Mock 回歸維持通過。

停止條件：任何未知 flight、保存未確認、日期接受證據不足、舊 writer 無法排除，停止相關自動化並保留紀錄。不以清空 pending、重送、補 XP 或修改 Firebase Rules／Schema 解決。
