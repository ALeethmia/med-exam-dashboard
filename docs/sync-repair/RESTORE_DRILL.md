# Firebase 全樹備份還原演練（僅合成 Emulator）

本輪基準 `a33aa80fc9ebf53c9849d1d6f974cac3e9822e81`。沿用 checksum 固定的 RTDB Emulator 4.11.2 runner，自行啟動臨時 loopback instance；無正式 URL 參數或正式管理憑證。只修改合成 fixture、測試與此文件；不改同步核心、七組隔離或 Rules。

## 實際測試

`tests/fixtures/synthetic-restore.json` 恰有使用者描述的七個頂層根：checklist、custom_events、habits、pharmacology、physiology、questOS、videos。全部內容重新合成，沒有真實個資。覆蓋日期字串、事件、課程／習慣 Boolean、Unicode、0、空字串，以及密集／稀疏／巢狀／全 null 陣列與空容器。

`tests/sync-queue/backup-restore-emulator.mjs` 由既有 runner 呼叫，直接使用 Emulator REST PUT／GET，不用 SDK 快取：

1. 將合成 JSON 寫入 instance 根，再讀取**全樹**；與明列的預期正規化樹深度相等，逐 leaf 核對 path／型別／值，驗證只有指定七根。另讀單一 null／false／0 路徑。
2. 將讀回的全樹 JSON serialize／parse 並記錄穩定排序的 SHA-256；根 PUT null 清空，GET 必須為 null，再根 PUT 還原。GET 與備份深度相等、非 null leaves 完全一致、hash 相同。
3. 再次清空並還原最初的合成輸入，驗證仍得到相同的伺服器正規化樹。沒有遺失或增加任何有效 leaf，沒有把合法 false／0 丟掉。

局部命令（不接受遠端 instance，所有清空僅作用於 runner 自建 Emulator）：

```sh
B2B1_EMULATOR_JAR="$PWD/work/firebase/database.jar" FIREBASE_SDK_DIR="$PWD/work/firebase" node tests/sync-queue/durable-course-emulator.mjs --restore-only
```

預設 CI 不帶 selector：保留原全部 80 組情境，再加本輪 2 組。局部結果 2/2，最終 Head CI 與結果連結記錄在 Draft PR #26，不拿先前 Head 的成功代替。

## null 與容器的實測差異

RTDB 是 key/value tree，沒有可持久化的 null leaf 或獨立的 JavaScript array 容器型別。null 表示無資料／刪除；讀回陣列中的 null 只是缺少數字鍵時的空位表示。

| 合成輸入 | Emulator REST GET 結果 |
|---|---|
| `[null,true,false,null,true,null]` | `[null,true,false,null,true]`；尾端不存在的索引不保留 |
| `[null,"first",false,null,0,null]` | `[null,"first",false,null,0]`；中間空位、false、0 保留 |
| `[null,null,null,null,"last",null]` | `{"4":"last"}`；稀疏數字鍵以物件讀回，索引 4 不變 |
| `{"0":"a","1":"b"}` | `["a","b"]`；密集數字鍵可讀成陣列 |
| `[null,null]`、`[]`、`{}`、null 子節點 | 該節點不存在，不是可還原的實體空容器 |
| `[{"kept":"value","removed":null},null,{"count":2}]` | `[{"kept":"value"},null,{"count":2}]` |

陣列／物件 JSON 外觀及長度可能變化；每個存在 leaf 的 path、scalar type 與內容不變。不能要求原始 JSON 位元組 hash 等於 server 重匯出的 hash，也不能宣稱 null 占位或原始容器型別可無損持久化。

## 後續正式流程的安全用法與限制

這項演練證明此合成結構能在指定 Emulator 版本達成 server tree 的還原固定點；**不證明使用者真實匯出已完整、最新或通過還原**，也不是正式 restore 執行授權。

- 保留原始正式匯出原封不動的檔案與獨立 SHA-256、來源 instance／時間／Rules；若要保留原始 array 長度或 null 外觀，留在外部備份 metadata，不對正式 schema 加 sentinel。
- 經授權取得完整 frozen server snapshot 後，先在隔離 Emulator 還原該檔，檢查全樹正規化差異、有效 leaves 與型別；記錄 server-normalized artifact 的獨立 canonical hash，與原始檔 hash 分開使用。任一未知差異都停止，不把差異一律當正常 null 處理。
- 不得用 `filter(Boolean)`、移除 null 後重排索引，或把數字鍵物件任意 compact 成 list；否則會改變課程／事件索引，並誤刪 false、0、空字串。若出現 `.priority` 等本輪未測匯出 metadata，須補驗 export-format／priority，不能宣稱本輪 JSON-only 測試已覆蓋。
- 正式復原仍依 [CUTOVER.md](CUTOVER.md)：獨立授權、freeze、保全切換後的新成功紀錄及其他 UID，不倒退／重用課程與生活 generation／era。測試中的整個根清空／PUT 只供**可拋棄 Emulator**，不是可複製到正式 instance 的復原指令。
- 目前未具備相容回復 build、正式備份驗證或正式資料變更授權的事實不變。本輪沒有連線正式 Firebase，PR 保持 Draft，等待 Code Review。
