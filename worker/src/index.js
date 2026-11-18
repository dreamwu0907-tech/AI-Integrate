const FREE_ROUTER = "openrouter/free";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const EXCLUDED_MODEL_HINTS = /rerank|embedding|embedder|transcrib|speech|text-to-speech|tts|image|vision-only|decider|span-01|moderation/i;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed.length ? allowed[0] : "null");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function withCors(response, origin, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin, env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

function isZeroPrice(value) {
  return value !== undefined && value !== null && Number(value) === 0;
}

function isEligibleFreeChatModel(model) {
  const id = String(model.id || "");
  const architecture = model.architecture || {};
  const pricing = model.pricing || {};
  const searchable = [id, model.name, model.description].join(" ");
  return id.endsWith(":free") &&
    !EXCLUDED_MODEL_HINTS.test(searchable) &&
    architecture.output_modalities?.includes("text") &&
    architecture.input_modalities?.includes("text") &&
    isZeroPrice(pricing.prompt) &&
    isZeroPrice(pricing.completion) &&
    (pricing.request === undefined || isZeroPrice(pricing.request));
}

function modelScore(model, task, difficulty) {
  const id = String(model.id || "").toLowerCase();
  const name = String(model.name || "").toLowerCase();
  const description = String(model.description || "").toLowerCase();
  const text = id + " " + name + " " + description;
  let score = 0;
  const add = (pattern, points) => { if (pattern.test(text)) score += points; };

  if (task === "coding") {
    add(/coder|coding|code|programming|qwen|deepseek|nemotron/, 8);
    add(/instruct|reasoning/, 2);
  } else if (task === "engineering") {
    add(/reasoning|nemotron|ernie|qwen|deepseek|instruct/, 7);
    add(/math|science|technical/, 3);
  } else if (task === "research") {
    add(/reasoning|nemotron|ernie|deepseek|research|instruct/, 7);
    add(/long context|long-context|agent/, 2);
  } else if (task === "translation") {
    add(/ernie|qwen|aya|multilingual|translation|gemma/, 7);
    add(/instruct|chat/, 2);
  } else {
    add(/nemotron|ernie|qwen|instruct|chat/, 5);
    add(/reasoning/, 2);
  }

  if (difficulty === "complex") add(/reasoning|nemotron|ernie|deepseek|qwen/, 4);
  if (/1\.5b|1\.7b|2b|3b|small|tiny|mini/.test(text)) score -= 3;
  if (/ultra|large|70b|100b|flash/.test(text)) score += 2;
  score += Math.min(Number(model.context_length || 0) / 200000, 2);
  return score;
}

function chooseFreeModels(models, task, difficulty) {
  return models.filter(isEligibleFreeChatModel)
    .map(model => ({ model, score: modelScore(model, task, difficulty) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.model);
}

function routeReason(task, difficulty) {
  const names = {
    general: "一般問答：優先選擇通用指令模型",
    translation: "語言任務：優先選擇多語言與指令模型",
    engineering: "工程計算：優先選擇推理與技術分析取向模型",
    research: "研究分析：優先選擇長上下文與推理取向模型",
    coding: "程式開發：優先選擇程式碼與推理取向模型"
  };
  return `${names[task] || names.general}；${difficulty === "complex" ? "高複雜度優先" : "一般難度"}`;
}

async function getFreeModels(apiKey) {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { "Authorization": `Bearer ${apiKey}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "無法取得 OpenRouter 模型清單。");
  return (body.data || []).filter(isEligibleFreeChatModel);
}

function extractAnswer(choice) {
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => typeof part === "string" ? part : (part?.text || "")).join("").trim();
  }
  return "";
}

async function callModel(apiKey, model, messages, maxTokens, env) {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.APP_SITE_URL || "https://dreamwu0907-tech.github.io/AI-Integrate/",
      "X-Title": "AI Integrate"
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      temperature: 0.3,
      max_tokens: Math.min(Math.max(Number(maxTokens) || 1800, 256), 3000),
      usage: { include: true }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: body.error?.message || `模型服務回應 HTTP ${response.status}`, status: response.status };
  }
  const choice = body.choices?.[0];
  const answer = extractAnswer(choice);
  return {
    ok: Boolean(answer),
    answer,
    model: body.model || model.id,
    usage: body.usage || null,
    finishReason: choice?.finish_reason || null,
    error: answer ? null : "模型回傳成功，但沒有可顯示的文字內容。"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (origin && !allowedOrigins.includes(origin)) return json({ error: "此網站來源未獲授權。" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    if (!env.OPENROUTER_API_KEY || !env.APP_ACCESS_TOKEN) {
      return withCors(json({ error: "後端尚未完成設定：請設定 OPENROUTER_API_KEY 與 APP_ACCESS_TOKEN。" }, 503), origin, env);
    }
    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.APP_ACCESS_TOKEN}`) {
      return withCors(json({ error: "存取金鑰錯誤或未提供。" }, 401), origin, env);
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return withCors(json({ ok: true, service: "AI Integrate Worker", routing: "task-aware-free-only" }), origin, env);
      }
      if (url.pathname === "/api/models" && request.method === "GET") {
        const models = await getFreeModels(env.OPENROUTER_API_KEY);
        return withCors(json({
          models: models.map(m => ({
            id: m.id,
            name: m.name || m.id,
            context_length: m.context_length || null,
            description: m.description || ""
          }))
        }), origin, env);
      }
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const contentLength = Number(request.headers.get("Content-Length") || 0);
        if (contentLength > 50000) return withCors(json({ error: "請求內容過大，請縮短問題後重試。" }, 413), origin, env);
        const payload = await request.json();
        if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 12) {
          return withCors(json({ error: "訊息格式錯誤或訊息數量超出限制。" }, 400), origin, env);
        }
        const totalChars = payload.messages.reduce((sum, item) => sum + String(item.content || "").length, 0);
        if (totalChars > 20000) return withCors(json({ error: "問題內容超過 20,000 字元限制。" }, 413), origin, env);

        const allFreeModels = await getFreeModels(env.OPENROUTER_API_KEY);
        if (!allFreeModels.length) return withCors(json({ error: "目前找不到符合零費用與文字對話條件的免費模型，未呼叫任何付費模型。" }, 503), origin, env);

        const task = ["general", "translation", "engineering", "research", "coding"].includes(payload.task) ? payload.task : "general";
        const difficulty = payload.difficulty === "complex" ? "complex" : "standard";
        const requestedModel = String(payload.model || "auto");
        let candidates;
        if (requestedModel === "auto" || requestedModel === FREE_ROUTER) {
          candidates = chooseFreeModels(allFreeModels, task, difficulty);
        } else {
          const exact = allFreeModels.find(m => m.id === requestedModel);
          if (!exact) return withCors(json({ error: "指定模型目前不在已驗證的零費用免費模型清單中，已阻止呼叫。" }, 400), origin, env);
          candidates = [exact];
        }
        if (!candidates.length) return withCors(json({ error: "此任務目前沒有可用的免費模型，未呼叫付費模型。" }, 503), origin, env);

        const attempts = [];
        const maxAttempts = requestedModel === "auto" || requestedModel === FREE_ROUTER ? Math.min(2, candidates.length) : 1;
        for (const candidate of candidates.slice(0, maxAttempts)) {
          const result = await callModel(env.OPENROUTER_API_KEY, candidate, payload.messages, payload.max_tokens, env);
          attempts.push({ model: candidate.id, ok: result.ok, error: result.error || null, finishReason: result.finishReason || null });
          if (result.ok) {
            return withCors(json({
              answer: result.answer,
              model: result.model,
              usage: result.usage,
              task,
              difficulty,
              routeReason: routeReason(task, difficulty),
              fallback: attempts.length > 1,
              diagnostics: { finishReason: result.finishReason, attempts }
            }), origin, env);
          }
        }
        return withCors(json({
          error: "免費模型未能產生有效文字回答。系統已停止，沒有改用付費模型。",
          diagnostics: { attempts }
        }, 502), origin, env);
      }
      return withCors(json({ error: "找不到 API 路徑。" }, 404), origin, env);
    } catch (error) {
      return withCors(json({ error: error.message || "Worker 發生未知錯誤。" }, 500), origin, env);
    }
  }
};