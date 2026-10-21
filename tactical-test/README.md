# 戰國群雄錄 V4.0-D2｜iPhone 戰棋試玩版

## D2 變更
- 點選當前陣營可用部隊，直接送出 `ACTIVATE_UNIT`，立即顯示合法移動格；點格子直接移動。
- 取消「啟動部隊」與「移動」按鈕；快捷指令列在手機上採黏附定位。
- 點選合法敵軍開啟攻擊確認視窗，避免誤觸立即攻擊。
- 此示範戰役使用 `damageScale: 2.7`，預期一般滿編對戰單擊約 100～160 人，實際依攻防、兵力與亂數浮動。引擎預設仍為 1，以保留 C1～C8 測試及相容性。
- D2 未修改戰略大地圖，尚無完整 AI、正式戰術卡與戰後永久結算。

## 部署
將資料夾內的 `index.html`、`style.css`、`ui.mjs` 與全部 `.mjs` 模組上傳到 GitHub repo 的 `tactical-test/`（覆蓋其中舊版同名檔案）。原始 repo 根目錄 `index.html` 不動。GitHub Pages 網址為 `/sengoku-game/tactical-test/`。

## 測試
`node --test *.test.mjs`。新版本額外提供 `battle-d2.test.mjs` 驗證傷害倍率與相容性。
