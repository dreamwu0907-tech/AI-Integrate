const FREE_ROUTER = "openrouter/free";

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (origin && !allowedOrigins.includes(origin)) return json({ error: "此網站來源未獲授權。" }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }
    if (!env.OPENROUTER_API_KEY || !env.APP_ACCESS_TOKEN) {
      return withCors(json({ error: "後端尚未完成設定：請設定 OPENROUTER_API_KEY 與 APP_ACCESS_TOKEN。" }, 503), origin, env);
    }
    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.APP_ACCESS_TOKEN}`) {
      return withCors(json({ error: "存取金鑰錯誤或未提供。" }, 401), origin, env);
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return withCors(json({ ok: true, service: "AI Integrate Worker" }), origin, env);
      }
      if (url.pathname === "/api/models" && request.method === "GET") {
        const upstream = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { "Authorization": `Bearer ${env.OPENROUTER_API_KEY}` }
        });
        const body = await upstream.json();
        if (!upstream.ok) return withCors(json({ error: body.error?.message || "無法取得模型清單。" }, upstream.status), origin, env);
        const models = (body.data || [])
          .filter(m => m.id?.endsWith(":free") && m.architecture?.output_modalities?.includes("text"))
          .map(m => ({ id: m.id, name: m.name || m.id, context_length: m.context_length || null }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return withCors(json({ models }), origin, env);
      }
      if (url.pathname === "/api/chat" && request.method === "POST") {
        const contentLength = Number(request.headers.get("Content-Length") || 0);
        if (contentLength > 50000) return withCors(json({ error: "請求內容過大，請縮短問題後重試。" }, 413), origin, env);
        const payload = await request.json();
        const model = String(payload.model || "");
        const allowedFreeModel = model === FREE_ROUTER || model.endsWith(":free");
        if (!allowedFreeModel) return withCors(json({ error: "安全限制：只允許 openrouter/free 或 :free 模型。" }, 400), origin, env);
        if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 12) {
          return withCors(json({ error: "訊息格式錯誤或訊息數量超出限制。" }, 400), origin, env);
        }
        const totalChars = payload.messages.reduce((sum, item) => sum + String(item.content || "").length, 0);
        if (totalChars > 20000) return withCors(json({ error: "問題內容超過 20,000 字元限制。" }, 413), origin, env);
        const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": env.APP_SITE_URL || "https://github.com/dreamwu0907-tech/AI-Integrate",
            "X-Title": "AI Integrate"
          },
          body: JSON.stringify({
            model,
            messages: payload.messages,
            temperature: 0.3,
            max_tokens: 1800
          })
        });
        const body = await upstream.json();
        if (!upstream.ok) {
          const message = body.error?.message || "模型服務暫時無法使用。";
          return withCors(json({ error: message }, upstream.status), origin, env);
        }
        const answer = body.choices?.[0]?.message?.content || "模型沒有回傳文字內容。";
        return withCors(json({
          answer,
          model: body.model || model,
          usage: body.usage || null
        }), origin, env);
      }
      return withCors(json({ error: "找不到 API 路徑。" }, 404), origin, env);
    } catch (error) {
      return withCors(json({ error: error.message || "Worker 發生未知錯誤。" }, 500), origin, env);
    }
  }
};