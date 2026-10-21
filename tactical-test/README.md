# 戰國群雄錄 V4.0-D5（兵種相剋試玩版）

基於 D4 單人 AI 對戰版，獨立部署至 `sengoku-game/tactical-test/`，不改動大地圖與存檔。

## D5 變更
- 將戰場下方重複的攻守／移動圖例換成兵種相剋提示。
- 槍剋騎、騎剋弓、弓剋槍：攻擊克制目標時傷害倍率 1.15；被克制時 0.90。
- 鐵砲暫不參與固定相剋，仍保留原本射程、火力與裝填規則。
- 相剋倍率直接整合 `battle-combat.mjs` 傷害公式，戰報顯示相剋狀態。
- 倍率為暫定平衡參數，尚未實機驗證。

## 測試
`node --test *.test.mjs`，本版 119/119 通過。

## 部署
將 ZIP 解壓縮後的全部檔案上傳到 GitHub 專案 `tactical-test/`，覆蓋同名檔案。不要覆蓋根目錄的 `index.html`。
GitHub Pages: `https://jaydenyu-0920.github.io/sengoku-game/tactical-test/`
