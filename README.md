# AI Integrate

個人使用的多模型 AI 工作台，採免費優先策略。

## 第一版功能
- **自動模式**：使用 OpenRouter `openrouter/free`，由免費模型路由器挑選可用模型。網站會先以簡單規則分類任務，並把任務類型提供給模型作為回答指引；分類不代表能保證路由到特定專長模型。
- **多 AI 比較**：同一問題同時送至最多 3 個自行勾選的免費模型。
- **免費模型清單**：從 OpenRouter Models API 取得 `:free` 模型。
- **本機歷史紀錄**：對話紀錄只存在目前瀏覽器。
- **金鑰保護**：OpenRouter API Key 只放在 Cloudflare Worker Secret，不會放入前端或 GitHub。

## 技術
- React + Vite
- GitHub Pages
- Cloudflare Workers
- OpenRouter API

## A. 部署前端
1. GitHub → Repository → **Settings → Pages**。
2. 在 Build and deployment 的 Source 選擇 **GitHub Actions**。
3. 確認 main 分支有最新程式碼。推送後 Actions 會自動建置及部署。
4. 網站網址：<https://dreamwu0907-tech.github.io/AI-Integrate/>

## B. 建立 OpenRouter API Key
1. 到 <https://openrouter.ai/settings/keys> 註冊／登入。
2. 建立 API Key。
3. 不要把 API Key 貼到聊天視窗、GitHub 檔案或前端設定。

OpenRouter 的 `openrouter/free` 會從當下可用的免費模型中選擇；具名免費模型通常以 `:free` 結尾。免費模型會有速率及每日請求限制，且供應狀態可能變動。

## C. 部署 Cloudflare Worker
1. 在 <https://dash.cloudflare.com/> 登入。
2. 開啟 **Workers & Pages**，建立 Worker，命名為 `ai-integrate-api`。
3. 將 `worker/src/index.js` 的完整內容貼入 Worker 編輯器並部署。
4. 在 Worker 的 Settings → Variables and Secrets 新增以下設定：
   - Secret：`OPENROUTER_API_KEY` = 你的 OpenRouter API Key
   - Secret：`APP_ACCESS_TOKEN` = 自行產生的長隨機字串（建議至少 32 個隨機字元）
   - Variable：`ALLOWED_ORIGINS` = `https://dreamwu0907-tech.github.io`
   - Variable：`APP_SITE_URL` = `https://dreamwu0907-tech.github.io/AI-Integrate/`
5. 重新部署 Worker。
6. 記下 Worker 網址，格式通常為 `https://ai-integrate-api.<你的子網域>.workers.dev`。

也可以使用 Wrangler CLI，參考 `worker/wrangler.toml`：
```bash
npm install -g wrangler
cd worker
wrangler login
wrangler secret put OPENROUTER_API_KEY
wrangler secret put APP_ACCESS_TOKEN
wrangler deploy
```

## D. 連接網站
1. 開啟 GitHub Pages 網站。
2. 點右上角設定。
3. Worker API 網址填入你的 `workers.dev` 網址。
4. Worker 存取金鑰填入 `APP_ACCESS_TOKEN`。
5. 按「儲存並測試連線」。成功後即可取得免費模型清單及開始提問。

## 免費與安全限制
- Worker 只允許 `openrouter/free` 或模型 ID 以 `:free` 結尾的模型。
- 不會自動切換到付費模型。
- 多模型比較最多同時呼叫 3 個模型；每個模型呼叫都會計入 OpenRouter 請求額度。
- OpenRouter 免費模型可能限流、暫停或下架；模型服務可用性由供應商決定。
- Worker 有來源網域檢查、存取金鑰檢查及請求長度限制。這是個人使用的基本保護，不等於完整的使用者身分驗證或精確每日用量配額。
- Cloudflare Worker 免費額度與 OpenRouter 免費模型額度是兩種不同限制，政策可能變動。
- 不要在這個個人工作台輸入密碼、API Key、個資或機密公司資料。部分免費模型供應商可能依其政策保留請求資料。

## 本機開發
```bash
npm install
npm run dev
npm run build
```
