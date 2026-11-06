import React, { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownUp, Bot, Check, ChevronDown, CircleHelp, Clock3, Copy, Cpu, History, KeyRound, LoaderCircle, MessageSquare, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, Trash2, Users, Zap } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const STORE_KEY = "ai-integrate-history-v1";
const TOKEN_KEY = "ai-integrate-access-token";

const taskLabels = {
  general: "一般問答",
  translation: "翻譯與語言",
  engineering: "工程與計算",
  research: "研究與分析",
  coding: "程式開發"
};

function classifyTask(text) {
  const s = text.toLowerCase();
  if (/translate|翻譯|英文|文法|grammar|sentence|日文/.test(s)) return "translation";
  if (/程式|github|code|debug|javascript|python|react|網站|程式碼/.test(s)) return "coding";
  if (/熱阻|壓降|流量|水冷|液冷|散熱|thermal|cooling|公式|計算|工程/.test(s)) return "engineering";
  if (/股票|台股|產業|公司|財報|市場|研究|比較|趨勢|分析/.test(s)) return "research";
  return "general";
}

function readHistory() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}

export default function App() {
  const [page, setPage] = useState("chat");
  const [mode, setMode] = useState("auto");
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("尚未連線");
  const [error, setError] = useState("");
  const [history, setHistory] = useState(readHistory);
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [showSettings, setShowSettings] = useState(false);
  const [apiBaseDraft, setApiBaseDraft] = useState(API_BASE);
  const task = useMemo(() => classifyTask(prompt), [prompt]);

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(history.slice(0, 40))); }, [history]);
  useEffect(() => { if (token) loadModels(); }, []);

  async function request(path, options = {}) {
    const response = await fetch(`${apiBaseDraft.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function loadModels() {
    setStatus("正在取得模型清單…"); setError("");
    try {
      const data = await request("/api/models");
      setModels(data.models || []);
      setStatus(`已取得 ${data.models?.length || 0} 個免費模型`);
      if (!selected.length && data.models?.length) setSelected(data.models.slice(0, 3).map(m => m.id));
    } catch (e) {
      setStatus("尚未連線");
      setError(e.message.includes("Failed to fetch") ? "無法連線後端。請先設定 Cloudflare Worker 網址與存取金鑰。" : e.message);
    }
  }

  async function submit() {
    if (!prompt.trim() || loading) return;
    if (!token) { setShowSettings(true); setError("請先設定 Worker 存取金鑰。"); return; }
    setLoading(true); setError(""); setResponses([]);
    const taskType = classifyTask(prompt);
    try {
      if (mode === "compare") {
        const chosen = selected.slice(0, 3);
        if (chosen.length < 2) throw new Error("請至少選擇兩個免費模型進行比較。");
        const results = await Promise.allSettled(chosen.map(model => request("/api/chat", {
          method: "POST", body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
        })));
        const rows = results.map((r, i) => ({
          model: chosen[i],
          text: r.status === "fulfilled" ? r.value.answer : `呼叫失敗：${r.reason.message}`,
          failed: r.status === "rejected"
        }));
        setResponses(rows);
        const record = { id: Date.now(), prompt, task: taskType, mode, responses: rows, createdAt: new Date().toISOString() };
        setHistory(h => [record, ...h].slice(0, 40));
      } else {
        const data = await request("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            model: "openrouter/free",
            messages: [
              { role: "system", content: `你是一位精準、謹慎的繁體中文助理。此任務類型為「${taskLabels[taskType]}」。請依任務需求回答；涉及即時資訊時明確指出需要查證，不要捏造來源或數據。` },
              { role: "user", content: prompt }
            ]
          })
        });
        const rows = [{ model: data.model || "openrouter/free", text: data.answer, usage: data.usage }];
        setResponses(rows);
        const record = { id: Date.now(), prompt, task: taskType, mode, responses: rows, createdAt: new Date().toISOString() };
        setHistory(h => [record, ...h].slice(0, 40));
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function restore(record) { setPrompt(record.prompt); setResponses(record.responses || []); setPage("chat"); }
  function copy(text) { navigator.clipboard?.writeText(text); }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Bot size={22}/></div><div><b>AI Integrate</b><small>PERSONAL AI WORKSPACE</small></div></div>
      <div className="nav-label">工作區</div>
      <button className={page === "chat" ? "nav-item active" : "nav-item"} onClick={() => setPage("chat")}><MessageSquare size={17}/> AI 對話</button>
      <button className={page === "models" ? "nav-item active" : "nav-item"} onClick={() => setPage("models")}><Cpu size={17}/> 免費模型管理</button>
      <button className={page === "history" ? "nav-item active" : "nav-item"} onClick={() => setPage("history")}><History size={17}/> 使用紀錄</button>
      <div className="sidebar-bottom">
        <div className="connection"><span className={models.length ? "dot online" : "dot"}></span><span>{status}</span></div>
        <button className="nav-item" onClick={() => setShowSettings(true)}><Settings2 size={17}/> 連線設定</button>
        <div className="free-note"><ShieldCheck size={16}/><span>免費模型限定<br/>不自動呼叫付費模型</span></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="mobile-brand"><Bot size={20}/> AI Integrate</div>
        <div className="breadcrumb">工作區 <span>/</span> {page === "chat" ? "AI 對話" : page === "models" ? "免費模型管理" : "使用紀錄"}</div>
        <button className="icon-button" title="連線設定" onClick={() => setShowSettings(true)}><Settings2 size={18}/></button>
      </header>

      {page === "chat" && <section className="content chat-content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> MULTI-MODEL AI</div><h1>今天想處理什麼？</h1><p>一個入口連接多種 AI，依任務自動選擇或並排比較答案。</p></div><div className="heading-chip"><Zap size={15}/> 免費優先</div></div>
        <div className="mode-switch">
          <button className={mode === "auto" ? "mode active" : "mode"} onClick={() => setMode("auto")}><Sparkles size={16}/><span><b>自動選擇</b><small>由免費模型路由器回答</small></span></button>
          <button className={mode === "compare" ? "mode active" : "mode"} onClick={() => setMode("compare")}><Users size={16}/><span><b>多 AI 比較</b><small>同一問題交給 2–3 個模型</small></span></button>
        </div>

        {mode === "compare" && <div className="model-picker panel"><div className="panel-title"><span>選擇比較模型</span><small>最多 3 個 · 僅顯示免費模型</small></div>
          {models.length ? <div className="model-options">{models.slice(0, 30).map(m => <label key={m.id} className="model-option"><input type="checkbox" checked={selected.includes(m.id)} onChange={e => setSelected(s => e.target.checked ? [...s, m.id].slice(-3) : s.filter(x => x !== m.id))}/><span>{m.name || m.id}</span><small>{m.id}</small></label>)}</div> : <div className="empty-inline">請先完成連線設定並取得模型清單。</div>}
        </div>}

        <div className="composer panel">
          <div className="composer-top"><span><MessageSquare size={15}/> 輸入你的問題</span><span className="task-pill">{taskLabels[task]}</span></div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }} placeholder="例如：請比較不同冷板鰭片設計對熱阻與壓降的影響…" rows={5}/>
          <div className="composer-bottom"><span>Ctrl / ⌘ + Enter 送出</span><button className="primary-button" onClick={submit} disabled={loading || !prompt.trim()}>{loading ? <LoaderCircle className="spin" size={17}/> : <Send size={16}/>} {loading ? "處理中…" : "送出問題"}</button></div>
        </div>
        {error && <div className="error-box"><CircleHelp size={17}/>{error}</div>}
        {loading && <div className="loading-line"><LoaderCircle className="spin" size={18}/> 正在等待模型回覆，免費模型可能因供應商負載而較慢…</div>}
        {responses.length > 0 && <div className="results"><div className="results-heading"><div><div className="eyebrow">AI OUTPUT</div><h2>模型回答</h2></div><button className="text-button" onClick={() => copy(responses.map(r => `【${r.model}】\n${r.text}`).join("\n\n"))}><Copy size={15}/> 複製全部</button></div><div className={responses.length > 1 ? "response-grid" : "response-grid single"}>{responses.map((r, i) => <article className="response-card" key={i}><div className="response-head"><span className="model-avatar"><Bot size={17}/></span><div><b>{r.model}</b><small>{r.failed ? "請求失敗" : "免費模型回覆"}</small></div><button className="icon-button" onClick={() => copy(r.text)} title="複製答案"><Copy size={16}/></button></div><div className="response-text">{r.text}</div></article>)}</div></div>}
        {!responses.length && <div className="hint-row"><div className="hint-icon"><Activity size={18}/></div><div><b>任務分類會先在本機執行</b><span>目前支援一般問答、翻譯、工程、研究及程式開發。自動模式使用 OpenRouter 免費路由。</span></div></div>}
      </section>}

      {page === "models" && <section className="content"><div className="page-heading"><div><div className="eyebrow"><Cpu size={14}/> MODEL DIRECTORY</div><h1>免費模型管理</h1><p>由 OpenRouter 即時取得免費模型清單。實際可用性仍受模型供應商限制。</p></div><button className="secondary-button" onClick={loadModels}><RefreshCw size={15}/> 更新清單</button></div>
        <div className="stats-grid"><div className="stat-card"><small>可用免費模型</small><strong>{models.length}</strong><span>目前 API 回傳</span></div><div className="stat-card"><small>已選取比較模型</small><strong>{selected.length}</strong><span>最多 3 個</span></div><div className="stat-card"><small>模型存取策略</small><strong>Free</strong><span>不使用付費模型</span></div></div>
        <div className="panel model-table"><div className="panel-title"><b>模型清單</b><small>{models.length ? "依 API 回傳順序" : "尚未取得資料"}</small></div>{models.length ? models.map(m => <div className="model-row" key={m.id}><div className="model-avatar"><Bot size={17}/></div><div className="model-info"><b>{m.name || m.id}</b><small>{m.id}</small></div><span className="free-tag">FREE</span><button className={selected.includes(m.id) ? "select-model chosen" : "select-model"} onClick={() => setSelected(s => selected.includes(m.id) ? s.filter(x => x !== m.id) : [...s, m.id].slice(-3))}>{selected.includes(m.id) ? <><Check size={14}/> 已選</> : "加入比較"}</button></div>) : <div className="empty-state"><Cpu size={30}/><b>尚未載入模型</b><span>請先設定 Worker 網址與存取金鑰。</span></div>}</div>
      </section>}

      {page === "history" && <section className="content"><div className="page-heading"><div><div className="eyebrow"><History size={14}/> LOCAL HISTORY</div><h1>使用紀錄</h1><p>紀錄只儲存在目前瀏覽器，不會同步到雲端。</p></div><button className="secondary-button danger-text" onClick={() => { if (confirm("確定清除所有本機紀錄？")) setHistory([]); }}><Trash2 size={15}/> 清除紀錄</button></div>
        <div className="history-list">{history.length ? history.map(r => <article className="history-card" key={r.id}><div className="history-meta"><span className="task-pill">{taskLabels[r.task] || "一般問答"}</span><small><Clock3 size={13}/> {new Date(r.createdAt).toLocaleString("zh-TW")}</small></div><b>{r.prompt}</b><div className="history-foot"><span>{r.responses?.length || 0} 個模型回覆</span><button className="text-button" onClick={() => restore(r)}>查看對話 <ArrowDownUp size={14}/></button></div></article>) : <div className="empty-state"><History size={30}/><b>目前沒有使用紀錄</b><span>完成第一次提問後，紀錄會顯示在這裡。</span></div>}</div>
      </section>}
      <footer className="footer">AI Integrate <span>·</span> 個人使用工具 <span>·</span> 免費模型優先</footer>
    </main>

    {showSettings && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setShowSettings(false)}><div className="settings-modal"><div className="modal-head"><div><div className="eyebrow">CONNECTION</div><h2>連線設定</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}>×</button></div>
      <label className="field-label">Cloudflare Worker API 網址<input value={apiBaseDraft} onChange={e => setApiBaseDraft(e.target.value)} placeholder="https://your-worker.your-subdomain.workers.dev"/></label>
      <label className="field-label">Worker 存取金鑰<input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="輸入你自行設定的 APP_ACCESS_TOKEN"/></label>
      <div className="security-note"><KeyRound size={16}/> 金鑰僅保存在此瀏覽器的 LocalStorage，不會提交至 GitHub。OpenRouter API Key 必須設定在 Cloudflare Worker Secret。</div>
      <div className="modal-actions"><button className="secondary-button" onClick={() => { setToken(""); localStorage.removeItem(TOKEN_KEY); }}>清除金鑰</button><button className="primary-button" onClick={() => { localStorage.setItem(TOKEN_KEY, token); setShowSettings(false); loadModels(); }}>儲存並測試連線</button></div>
      <p className="modal-help">尚未部署後端？請先依專案 README 完成 Cloudflare Worker 設定。</p>
    </div></div>}
  </div>;
}