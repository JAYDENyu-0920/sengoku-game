# 戰國群雄錄 B1 D8-A2.3 — 鐵砲自動裝填與固定天候

部署：將本壓縮檔內所有檔案上傳到 GitHub 儲存庫 `tactical-test/`，覆蓋同名檔案；不要覆蓋儲存庫根目錄 `index.html`。

- 戰前可選晴天、陰天、雨天、濃霧；開戰後天候固定。
- 鐵砲距離 2/3/4 格的傷害倍率為 1.3/1.1/0.9；惡劣天候射程縮短。
- 鐵砲射擊後自動裝填：晴/陰於下一輪恢復；雨/霧於下下輪恢復。無需手動裝填。
- 移動後不能射擊；弓兵保留原規則。
- 天候顯示於戰場狀態列，鐵砲狀態顯示於部隊資訊。
- `node --test *.test.mjs`：144 項通過（含新增 7 項天候回歸測試）。

此版本通過 Node 自動化測試，尚未完成 iPhone Safari 實機驗收。


D8-A2.4: Cavalry attacks against spear units now pause before damage for a 1-order phalanx (-30%) or pass decision. AI uses the defense if affordable.
