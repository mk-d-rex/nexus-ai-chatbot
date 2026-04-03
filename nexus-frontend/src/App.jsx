/**
 * NEXUS — Emotionally Intelligent AI Chatbot
 * ============================================
 * Architecture: Single-page React application (modular monolith)
 * AI Layer:     Anthropic Claude API (sentiment analysis + adaptive chat)
 * Storage:      In-memory with session state (production would add IndexedDB/backend)
 * Charts:       Recharts for analytics dashboard
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * ┌─────────────────────────────────────────────────────┐
 * │                  NEXUS Frontend                      │
 * │  ┌──────────┐  ┌────────────┐  ┌─────────────────┐ │
 * │  │ Sidebar  │  │  ChatView  │  │ AnalyticsDash   │ │
 * │  │ Sessions │  │  Messages  │  │ Pie/Area/Bar     │ │
 * │  │ Nav      │  │  Input     │  │ Emotion Trends   │ │
 * │  └──────────┘  └─────┬──────┘  └─────────────────┘ │
 * └────────────────────────┼────────────────────────────┘
 *                          │ fetch()
 *              ┌───────────▼────────────┐
 *              │   Anthropic Claude API  │
 *              │  /v1/messages           │
 *              │  ┌──────────────────┐  │
 *              │  │ analyzeSentiment │  │ → JSON: {sentiment, score, emotion}
 *              │  │ getChatResponse  │  │ → Tone-adapted text reply
 *              │  └──────────────────┘  │
 *              └────────────────────────┘
 *
 * TECH STACK JUSTIFICATION
 * ─────────────────────────
 * React:           Component model maps cleanly to chat UI primitives
 * Claude API:      Single model handles both NLP sentiment + generative chat
 *                  → Eliminates need for a separate Python NLP microservice
 *                  → Provides higher-quality emotion detection than VADER/TextBlob
 * Recharts:        Composable, React-native charting (no D3 configuration overhead)
 * In-memory state: Appropriate for this artifact; production would use:
 *                  - PostgreSQL (messages + sentiment_logs tables)
 *                  - Redis (session cache, rate limiting)
 *                  - WebSockets via Socket.IO (real-time multi-user)
 *
 * DATABASE SCHEMA (Production PostgreSQL)
 * ────────────────────────────────────────
 * users          → id, username, created_at, last_seen
 * sessions       → id, user_id, title, created_at
 * messages       → id, session_id, role, content, created_at
 * sentiment_logs → id, message_id, sentiment, score, emotion, confidence, created_at
 *
 * API ENDPOINTS (Production Express/NestJS)
 * ──────────────────────────────────────────
 * POST   /auth/login           → JWT token
 * GET    /sessions             → user sessions list
 * POST   /sessions             → create session
 * GET    /sessions/:id/messages → paginated messages
 * POST   /messages             → send + trigger sentiment analysis
 * GET    /analytics/dashboard  → aggregated sentiment stats
 * WS     /chat                 → real-time message stream
 *
 * ENVIRONMENT VARIABLES (Production)
 * ────────────────────────────────────
 * ANTHROPIC_API_KEY=sk-ant-...
 * DATABASE_URL=postgresql://...
 * REDIS_URL=redis://...
 * JWT_SECRET=...
 * RATE_LIMIT_WINDOW_MS=60000
 * RATE_LIMIT_MAX=30
 *
 * DEPLOYMENT (Docker + Cloud)
 * ────────────────────────────
 * docker-compose.yml:
 *   services: frontend (Next.js), backend (Node/Express),
 *             db (PostgreSQL), cache (Redis), nginx (reverse proxy)
 * Cloud: Vercel (frontend) + Railway/Render (backend) + Neon (DB)
 *
 * TESTING STRATEGY
 * ─────────────────
 * Unit:        Jest + Testing Library for components
 * Integration: Supertest for API routes
 * E2E:         Playwright (login → send message → verify sentiment badge)
 * Load:        k6 for WebSocket stress testing
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

// ═══════════════════════════════════════════════════════════════════
// DESIGN TOKENS — single source of truth for the visual system
// ═══════════════════════════════════════════════════════════════════

const T = {
  bg:           '#080910',
  surface:      '#0e0f1c',
  card:         '#13142280',
  cardSolid:    '#131422',
  border:       '#1f2035',
  borderHover:  '#2e3050',
  text:         '#dde1f5',
  textSub:      '#7b7fa0',
  textDim:      '#383a55',
  // Sentiment palette
  pos:          '#34d399',   // emerald
  posLight:     'rgba(52,211,153,0.10)',
  neg:          '#f87171',   // rose
  negLight:     'rgba(248,113,113,0.10)',
  neu:          '#818cf8',   // indigo
  neuLight:     'rgba(129,140,248,0.10)',
  // Brand
  accent:       '#6366f1',
  accentBright: '#818cf8',
  accentLight:  'rgba(99,102,241,0.12)',
  accentGlow:   'rgba(99,102,241,0.25)',
  grad:         'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
};

const SENT = {
  positive: { color: T.pos,  bg: T.posLight,  emoji: '😊', label: 'Positive', barColor: '#34d399' },
  negative: { color: T.neg,  bg: T.negLight,  emoji: '😔', label: 'Negative', barColor: '#f87171' },
  neutral:  { color: T.neu,  bg: T.neuLight,  emoji: '😐', label: 'Neutral',  barColor: '#818cf8' },
};

// ═══════════════════════════════════════════════════════════════════
// GLOBAL STYLES — injected once
// ═══════════════════════════════════════════════════════════════════

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: ${T.bg}; }
  body { font-family: 'DM Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 99px; }
  textarea, input, button { font-family: inherit; }
  textarea:focus, input:focus, button:focus { outline: none; }
  button { cursor: pointer; border: none; background: none; }

  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.5; transform: scale(0.85); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes shimmer {
    0%   { background-position: -300% 0; }
    100% { background-position: 300% 0; }
  }
  @keyframes breathe {
    0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
    50%       { box-shadow: 0 0 0 6px rgba(99,102,241,0.15); }
  }

  .msg-in { animation: fadeSlideUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards; }
  .pulse-dot { animation: pulse 2s ease-in-out infinite; }
  .spin { animation: spin 0.7s linear infinite; }
  .btn-primary {
    background: ${T.grad};
    color: white;
    font-weight: 600;
    border-radius: 10px;
    transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 0 20px ${T.accentGlow};
  }
  .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 24px ${T.accentGlow}; }
  .btn-primary:active:not(:disabled) { transform: translateY(0); }
  .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
  .session-btn:hover { background: ${T.accentLight} !important; }
  .nav-btn-hover:hover { background: ${T.card} !important; color: ${T.text} !important; }
  .logout-btn:hover { color: ${T.neg} !important; }
`;

function injectStyles() {
  if (document.querySelector('#nexus-styles')) return;
  const el = document.createElement('style');
  el.id = 'nexus-styles';
  el.textContent = GLOBAL_CSS;
  document.head.appendChild(el);
}

// ═══════════════════════════════════════════════════════════════════
// ANTHROPIC API — sentiment analysis + adaptive chat generation
// ═══════════════════════════════════════════════════════════════════

/**
 * Sentiment Analysis
 * Calls Claude with a strict JSON-only prompt.
 * In production: add Redis caching for identical inputs,
 * rate-limit per user (30 req/min), and retry with exponential backoff.
 */
async function analyzeSentiment(text) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 120,
        system: `You are a sentiment analysis API. Output ONLY a JSON object — no prose, no markdown.
Schema: {"sentiment":"positive"|"negative"|"neutral","score":number,"emotion":"string","confidence":number}
score: 0.0–1.0 (intensity; 1.0 = very strong)
emotion: single lowercase word (e.g. "excited", "frustrated", "bored", "hopeful")
confidence: 0.0–1.0 (how certain you are)`,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await res.json();
    const raw = (data.content?.[0]?.text || '{}').trim();
    const parsed = JSON.parse(raw);
    return {
      sentiment: ['positive','negative','neutral'].includes(parsed.sentiment)
        ? parsed.sentiment : 'neutral',
      score:      Math.min(1, Math.max(0, parseFloat(parsed.score)      || 0.5)),
      emotion:    typeof parsed.emotion === 'string' ? parsed.emotion   : 'calm',
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.7)),
    };
  } catch {
    return { sentiment: 'neutral', score: 0.5, emotion: 'calm', confidence: 0.6 };
  }
}

/**
 * Adaptive Chat Response
 * System prompt dynamically adjusts tone based on detected sentiment.
 * In production: stream via SSE for real-time token display.
 */
async function getChatResponse(history, sentimentData, username) {
  const toneMap = {
    positive: `The user feels ${sentimentData.emotion} — they're in a good place. Match their energy: be warm, engaging, maybe playful. Celebrate what's working.`,
    negative: `The user seems ${sentimentData.emotion}. Lead with empathy. Acknowledge their feelings before offering help. Be gentle, patient, and encouraging.`,
    neutral:  `The user is in a neutral state. Be helpful, clear, and genuinely interested in their needs. Don't over-embellish.`,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        system: `You are Nexus — an emotionally intelligent AI assistant.
Personality: warm, thoughtful, direct, occasionally witty. Never robotic or generic.
Emotional context: ${toneMap[sentimentData.sentiment]}
Detected emotion intensity: ${(sentimentData.score * 100).toFixed(0)}% (${sentimentData.emotion})
User's name: ${username}

Guidelines:
• Keep responses concise yet meaningful — 2 to 4 sentences is usually right
• Vary sentence structure; avoid starting every message the same way
• Never mention that you're doing sentiment analysis or adapting your tone
• If asked what you are, say you're Nexus, an emotionally-aware AI assistant`,
        messages: history,
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || "I'm here — want to tell me more?";
  } catch {
    return "Something went wrong on my end. Could you try again?";
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const fmt = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function computeAnalytics(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      counts: { positive: 0, neutral: 0, negative: 0 },
      msgs: 0,
      avgScore: 0,
      pie: [],
      trend: [],
      sessStats: [],
      topEmotions: [],
      total: 0
    };
  }

  const allMessages = sessions.flatMap(s => s.messages || []);

  let total = 0;
  let scoreSum = 0;

  const counts = { positive: 0, neutral: 0, negative: 0 };
  const emotionMap = {};
  const trend = [];

  allMessages.forEach((msg, i) => {
    if (msg.role !== "user") return;

    total++;

    const sentiment = msg.sentiment?.sentiment || "neutral";
    const score = (msg.sentiment?.score ?? 0.5) * 200 - 100;

    counts[sentiment]++;
    scoreSum += score;

    trend.push({ x: i + 1, v: score });

    const emotion = sentiment;
    emotionMap[emotion] = (emotionMap[emotion] || 0) + 1;
  });

  const pie = [
    { name: "positive", value: counts.positive, color: "#10b981" },
    { name: "neutral", value: counts.neutral, color: "#64748b" },
    { name: "negative", value: counts.negative, color: "#ef4444" }
  ];

  const avgScore = total ? scoreSum / total : 0;

  const sessStats = sessions.map((s, i) => {
    const c = { pos: 0, neg: 0, neu: 0 };

    (s.messages || []).forEach(m => {
      if (m.role !== "user") return;
      const t = m.sentiment?.sentiment || "neutral";
      if (t === "positive") c.pos++;
      else if (t === "negative") c.neg++;
      else c.neu++;
    });

    return {
      name: `S${i + 1}`,
      pos: c.pos,
      neg: c.neg,
      neu: c.neu
    };
  });

  const topEmotions = Object.entries(emotionMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    counts,
    msgs: allMessages.length,
    avgScore,
    pie,
    trend,
    sessStats,
    topEmotions,
    total
  };
}

// ═══════════════════════════════════════════════════════════════════
// ROOT APP COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function App() {
  useEffect(() => { injectStyles(); }, []);

  const [user,            setUser]            = useState(null);
  const [sessions,        setSessions]        = useState([]);
  const [activeId,        setActiveId]        = useState(null);
  const [view,            setView]            = useState('chat');
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [liveSentiment,   setLiveSentiment]   = useState(null);
  const [usernameInput,   setUsernameInput]   = useState('');
  
  async function fetchSessions(userId) {
  try {
    const res = await fetch(`http://localhost:5000/api/sessions?userId=${userId}`);
    return await res.json();
  } catch {
    return [];
  }
}

  useEffect(() => {
  if (!user) return;

  fetchSessions(user.id).then(data => {
    const formatted = data.map(s => ({
      id: s._id,
      title: s.title || "Chat",
      messages: s.messages || [],
      sentimentLog: s.sentimentLog || [],
      createdAt: s.createdAt || new Date()
    }));

    setSessions(formatted);

    // 🔥 ONLY set activeId if nothing is selected
    if (!activeId && formatted.length > 0) {
      setActiveId(formatted[0].id);
    }
  });
}, [user]);

  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sessions, activeId]);

  const activeSession = sessions.find(s => s.id === activeId);

  // ─── Authentication ──────────────────────────────────────────────

  const handleLogin = () => {
  const name = usernameInput.trim();
  if (!name) return;

  // 🔥 Use name as stable ID
  setUser({ id: name, name });

  setSessions([]);
  setActiveId(null);
};

  const handleLogout = () => {
    setUser(null); setSessions([]); setActiveId(null);
    setLiveSentiment(null); setUsernameInput('');
  };

  // ─── Session Management ──────────────────────────────────────────

  const newSession = useCallback(() => {
    const id = uid();
    setSessions(prev => [{ id, title: 'New Chat', messages: [], sentimentLog: [], createdAt: new Date() }, ...prev]);
    setActiveId(id);
    setView('chat');
    setLiveSentiment(null);
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const deleteSession = useCallback((id, e) => {
    e.stopPropagation();
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
        setLiveSentiment(null);
      }
      return next;
    });
  }, [activeId]);

  // ─── Message Send ────────────────────────────────────────────────
  async function sendMessageToBackend(message, sessionId) {
  try {
    const res = await fetch("http://localhost:5000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  message,
  sessionId,
  userId: user.id // 🔥 VERY IMPORTANT
})
    });

    return await res.json();
  } catch (err) {
    console.error("Frontend error:", err);
    return {
      sentiment: { sentiment: "neutral", score: 0.5 },
      reply: "Backend error."
    };
  }
}

  const handleSend = async () => {
  const text = input.trim();
  if (!text || loading || !activeId) return;

  setInput('');
  setLoading(true);

  const now = new Date();
  const msgId = uid();

  // ✅ 1. Add ONLY user message
  setSessions(prev =>
    prev.map(s =>
      s.id !== activeId
        ? s
        : {
            ...s,
            messages: [
              ...(s.messages || []),
              {
                id: msgId,
                role: "user",
                content: text,
                timestamp: now
              }
            ]
          }
    )
  );

  try {
    // ✅ 2. Call backend
    const isMongoId = activeId && activeId.length === 24;

    const { sentiment: sa, reply, sessionId: newSessionId } =
      await sendMessageToBackend(text, isMongoId ? activeId : null);

    // ✅ Sync session ID
    if (!isMongoId && newSessionId) {
  // 🔥 Replace temp session ID with real Mongo ID
  setSessions(prev =>
    prev.map(s =>
      s.id === activeId
        ? { ...s, id: newSessionId }
        : s
    )
  );

  setActiveId(newSessionId);
}

    setLiveSentiment(sa);

    // ✅ 3. Attach sentiment to user message + add assistant reply
    setSessions(prev =>
      prev.map(s =>
        s.id !== activeId
          ? s
          : {
              ...s,
              messages: [
                ...(s.messages || []).map(m =>
                  m.id === msgId ? { ...m, sentiment: sa } : m
                ),
                {
                  id: uid(),
                  role: "assistant",
                  content: reply,
                  timestamp: new Date(),
                  sentiment: null
                }
              ],
              sentimentLog: [
                ...(s.sentimentLog || []),
                { ...sa, timestamp: now, messageId: msgId }
              ]
            }
      )
    );

  } catch (err) {
    console.error('[Nexus] Error:', err);

    setSessions(prev =>
      prev.map(s =>
        s.id !== activeId
          ? s
          : {
              ...s,
              messages: [
                ...(s.messages || []),
                {
                  id: uid(),
                  role: 'assistant',
                  content: 'Something went wrong. Try again.',
                  timestamp: new Date(),
                  sentiment: null,
                  isError: true
                }
              ]
            }
      )
    );

  } finally {
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 40);
  }
};

  // ─── Render ──────────────────────────────────────────────────────

  if (!user) {
    return <LoginScreen value={usernameInput} onChange={setUsernameInput} onLogin={handleLogin} />;
  }

  const analytics = computeAnalytics(sessions);

  return (
    <div style={{ display: 'flex', height: '100vh', background: T.bg, overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar
        user={user}
        sessions={sessions}
        activeId={activeId}
        view={view}
        onSelect={id => { setActiveId(id); setView('chat'); }}
        onNew={newSession}
        onDelete={deleteSession}
        onViewChange={setView}
        onLogout={handleLogout}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {view === 'chat' ? (
          <ChatView
            session={activeSession}
            loading={loading}
            liveSentiment={liveSentiment}
            input={input}
            setInput={setInput}
            onSend={handleSend}
            endRef={endRef}
            inputRef={inputRef}
            user={user}
          />
        ) : (
          <AnalyticsDashboard data={analytics} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════

function LoginScreen({ value, onChange, onLogin }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bg, fontFamily: "'DM Sans', sans-serif",
      backgroundImage: `radial-gradient(ellipse 80% 60% at 50% -10%, ${T.accentGlow}, transparent)`,
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px', animation: 'fadeSlideUp 0.5s ease forwards' }}>

        {/* Logo mark */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 80, height: 80, margin: '0 auto 20px', borderRadius: 22,
            background: T.grad, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, boxShadow: `0 0 60px ${T.accentGlow}`,
          }}>
            ◈
          </div>
          <h1 style={{ color: T.text, fontSize: 36, fontWeight: 700, letterSpacing: '-1px', marginBottom: 8 }}>
            Nexus
          </h1>
          <p style={{ color: T.textSub, fontSize: 15 }}>
            An emotionally intelligent AI assistant
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: T.cardSolid, border: `1px solid ${T.border}`,
          borderRadius: 18, padding: 32,
          boxShadow: `0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}>
          <label style={{ color: T.textSub, fontSize: 13, display: 'block', marginBottom: 10, letterSpacing: '0.3px' }}>
            YOUR NAME
          </label>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onLogin()}
            placeholder="e.g. Jordan"
            autoFocus
            style={{
              width: '100%', padding: '13px 16px', marginBottom: 16,
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 10, color: T.text, fontSize: 15,
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <button
            className="btn-primary"
            onClick={onLogin}
            disabled={!value.trim()}
            style={{ width: '100%', padding: '13px 16px', fontSize: 15 }}
          >
            Start Chatting →
          </button>
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          {['Live Sentiment', 'Adaptive Tone', 'Analytics Dashboard', 'Multi-Session'].map(f => (
            <span key={f} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12,
              background: T.accentLight, border: `1px solid ${T.accent}30`,
              color: T.accentBright,
            }}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════

function Sidebar({ user, sessions, activeId, view, onSelect, onNew, onDelete, onViewChange, onLogout }) {
  return (
    <div style={{
      width: 264, flexShrink: 0, background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Brand */}
      <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: T.grad,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: `0 0 16px ${T.accentGlow}`,
          }}>◈</div>
          <span style={{ color: T.text, fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>Nexus</span>
        </div>

        {/* Nav toggle */}
        <div style={{ display: 'flex', background: T.bg, borderRadius: 9, padding: 3, gap: 2 }}>
          {[['chat', '💬', 'Chat'], ['analytics', '📊', 'Stats']].map(([v, icon, label]) => (
            <button key={v}
              onClick={() => onViewChange(v)}
              style={{
                flex: 1, padding: '7px 6px', borderRadius: 7, fontSize: 12, fontWeight: 500,
                background: view === v ? T.cardSolid : 'transparent',
                color: view === v ? T.text : T.textSub,
                border: view === v ? `1px solid ${T.border}` : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* New session */}
      <div style={{ padding: '10px 14px 6px' }}>
        <button
          onClick={onNew}
          className="nav-btn-hover"
          style={{
            width: '100%', padding: '9px 12px',
            border: `1px dashed ${T.border}`, borderRadius: 9,
            color: T.textSub, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New Chat
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: T.textDim, fontSize: 12 }}>
            No sessions yet.<br />Click + New Chat to begin.
          </div>
        ) : (
          sessions.map(s => {
            const last    = s.sentimentLog[s.sentimentLog.length - 1];
            const isActive = s.id === activeId;
            return (
              <button key={s.id}
                onClick={() => onSelect(s.id)}
                className="session-btn"
                style={{
                  width: '100%', padding: '9px 10px', borderRadius: 8, marginBottom: 1,
                  textAlign: 'left', transition: 'all 0.15s',
                  background: isActive ? T.accentLight : 'transparent',
                  border: `1px solid ${isActive ? T.accent + '35' : 'transparent'}`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: isActive ? T.text : T.textSub, fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: 2,
                  }}>
                    {s.title}
                  </div>
                  <div style={{ color: T.textDim, fontSize: 11, display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span>{s.messages.length} msg{s.messages.length !== 1 ? 's' : ''}</span>
                    {last && <><span>·</span>
                      <span style={{ color: SENT[last.sentiment]?.color }}>
                        {SENT[last.sentiment]?.emoji} {last.emotion}
                      </span>
                    </>}
                  </div>
                </div>
                {/* Delete */}
                <span
                  onClick={e => onDelete(s.id, e)}
                  style={{ color: T.textDim, fontSize: 14, padding: '2px 4px', borderRadius: 4,
                    transition: 'color 0.15s', flexShrink: 0,
                    ':hover': { color: T.neg }
                  }}
                  title="Delete session"
                >×</span>
              </button>
            );
          })
        )}
      </div>

      {/* User footer */}
      <div style={{
        padding: '14px 18px', borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: T.accentLight, border: `1px solid ${T.accent}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.accentBright, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
          }}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ color: T.text, fontSize: 13, fontWeight: 500 }}>{user.name}</span>
        </div>
        <button onClick={onLogout} className="logout-btn"
          style={{ color: T.textSub, fontSize: 12, padding: '4px 8px', borderRadius: 6, transition: 'color 0.15s' }}>
          Exit
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHAT VIEW
// ═══════════════════════════════════════════════════════════════════

function ChatView({ session, loading, liveSentiment, input, setInput, onSend, endRef, inputRef, user }) {
  const textareaRef = useRef(null);

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  };

  if (!session) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: T.textSub }}>
        <div style={{ fontSize: 40, opacity: 0.3 }}>◈</div>
        <p style={{ fontSize: 14 }}>Select a session or create a new chat</p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Chat header */}
      <div style={{
        padding: '14px 24px', background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ color: T.text, fontWeight: 600, fontSize: 15 }}>{session.title}</div>
          <div style={{ color: T.textSub, fontSize: 12, marginTop: 1 }}>
            {session.messages.length} messages · {session.sentimentLog.length} sentiment records
          </div>
        </div>
        <LiveSentimentBadge sentiment={liveSentiment} />
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {session.messages.length === 0 && !loading && (
          <EmptyState userName={user.name} />
        )}
        {session.messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} user={user} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={endRef} />
      </div>

      {/* Sentiment meter bar (visible when sentiment data exists) */}
      {liveSentiment && (
        <SentimentMeterBar sentiment={liveSentiment} />
      )}

      {/* Input area */}
      <div style={{ padding: '16px 24px', background: T.surface, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          background: T.bg, borderRadius: 14, padding: '12px 14px',
          border: `1px solid ${T.border}`, transition: 'border-color 0.2s',
        }}
          onFocus={() => {}} // handled by inner textarea
        >
          <textarea
            ref={el => { textareaRef.current = el; inputRef.current = el; }}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
            }}
            onFocus={e => e.target.closest('div').style.borderColor = T.accent}
            onBlur={e => e.target.closest('div').style.borderColor = T.border}
            placeholder="Type a message… (Enter to send · Shift+Enter for newline)"
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: T.text, fontSize: 14, resize: 'none', lineHeight: 1.55,
              fontFamily: "'DM Sans', sans-serif",
              minHeight: 22, maxHeight: 130, overflowY: 'auto',
            }}
          />
          <button
            className="btn-primary"
            onClick={onSend}
            disabled={!input.trim() || loading}
            style={{
              width: 38, height: 38, borderRadius: 10, fontSize: 18, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            {loading
              ? <span className="spin" style={{ fontSize: 16, display: 'inline-block' }}>↻</span>
              : '↑'
            }
          </button>
        </div>
        <p style={{ color: T.textDim, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          Nexus reads your emotional tone and adapts every response accordingly
        </p>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────

function EmptyState({ userName }) {
  const starters = [
    "How's your day going?", "I need some help with something.",
    "Tell me something interesting!", "I'm feeling a bit overwhelmed lately.",
  ];
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px 20px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18, background: T.grad,
        margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, boxShadow: `0 0 40px ${T.accentGlow}`,
      }}>◈</div>
      <h3 style={{ color: T.text, fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        Hey, {userName}!
      </h3>
      <p style={{ color: T.textSub, fontSize: 14, marginBottom: 28 }}>
        I'll pick up on how you're feeling and respond accordingly.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {starters.map(s => (
          <span key={s} style={{
            padding: '8px 14px', borderRadius: 20, fontSize: 13,
            background: T.cardSolid, border: `1px solid ${T.border}`,
            color: T.textSub, cursor: 'default',
          }}>"{s}"</span>
        ))}
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────

function MessageBubble({ msg, user }) {
  const isUser  = msg.role === 'user';
  const sa      = msg.sentiment;
  const sentCfg = sa ? SENT[sa.sentiment] : null;

  return (
    <div className="msg-in" style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 10, alignItems: 'flex-start',
    }}>
      {/* Avatar */}
      <div style={{
        width: 34, height: 34, borderRadius: 11, flexShrink: 0,
        background: isUser ? T.accentLight : T.grad,
        border: isUser ? `1px solid ${T.accent}35` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isUser ? T.accentBright : 'white',
        fontSize: isUser ? 11 : 15, fontWeight: 700,
        boxShadow: isUser ? 'none' : `0 2px 12px ${T.accentGlow}`,
      }}>
        {isUser ? user.name.slice(0, 2).toUpperCase() : '◈'}
      </div>

      {/* Content column */}
      <div style={{ maxWidth: '72%', minWidth: 60, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Bubble */}
        <div style={{
          padding: '12px 16px',
          background: isUser ? T.cardSolid : T.surface,
          borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          border: `1px solid ${isUser && sentCfg ? sentCfg.color + '35' : T.border}`,
          borderLeft: isUser && sentCfg ? `3px solid ${sentCfg.color}` : undefined,
          color: T.text, fontSize: 14, lineHeight: 1.65,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          opacity: msg.isError ? 0.6 : 1,
        }}>
          {msg.content}
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          flexDirection: isUser ? 'row-reverse' : 'row',
          padding: '0 2px',
        }}>
          <span style={{ color: T.textDim, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt(msg.timestamp)}
          </span>
          {sa && sentCfg && (
            <span style={{
              padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: sentCfg.bg, color: sentCfg.color,
              border: `1px solid ${sentCfg.color}25`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span>{sentCfg.emoji}</span>
              <span style={{ textTransform: 'capitalize' }}>{sa.emotion}</span>
              <span style={{ opacity: 0.65 }}>· {(sa.score * 100).toFixed(0)}%</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Live Sentiment Badge ─────────────────────────────────────────

function LiveSentimentBadge({ sentiment }) {
  if (!sentiment) return null;
  const cfg = SENT[sentiment.sentiment];
  if (!cfg) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 14px', borderRadius: 24,
      background: cfg.bg, border: `1px solid ${cfg.color}30`,
      animation: 'fadeSlideUp 0.3s ease forwards',
    }}>
      <span className="pulse-dot" style={{
        width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'block',
      }} />
      <span style={{ color: cfg.color, fontSize: 13, fontWeight: 500 }}>
        {cfg.emoji} {sentiment.emotion}
      </span>
      <span style={{
        color: cfg.color, fontSize: 11, opacity: 0.65,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {(sentiment.confidence * 100).toFixed(0)}% conf
      </span>
    </div>
  );
}

// ─── Sentiment Meter Bar ──────────────────────────────────────────

function SentimentMeterBar({ sentiment }) {
  const cfg   = SENT[sentiment.sentiment];
  const score = sentiment.sentiment === 'positive'
    ?  sentiment.score
    : sentiment.sentiment === 'negative'
    ? -sentiment.score : 0;
  const pct = ((score + 1) / 2) * 100; // map -1..1 → 0..100

  return (
    <div style={{ padding: '0 24px 6px', flexShrink: 0 }}>
      <div style={{ height: 3, background: T.border, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '100%',
          width: `${pct}%`,
          background: cfg.color,
          borderRadius: 2,
          transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: `0 0 8px ${cfg.color}60`,
        }} />
        {/* Neutral midpoint marker */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', width: 1, height: '100%',
          background: T.border, transform: 'translateX(-50%)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ color: T.neg, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>–neg</span>
        <span style={{ color: T.textDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>neutral</span>
        <span style={{ color: T.pos, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>pos+</span>
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="msg-in" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 34, height: 34, borderRadius: 11, background: T.grad,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontSize: 15, flexShrink: 0,
        boxShadow: `0 2px 12px ${T.accentGlow}`,
      }}>◈</div>
      <div style={{
        padding: '14px 18px', background: T.surface, borderRadius: '4px 14px 14px 14px',
        border: `1px solid ${T.border}`, display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 0.2, 0.4].map((delay, i) => (
          <div key={i} className="pulse-dot" style={{
            width: 7, height: 7, borderRadius: '50%', background: T.accentBright,
            animationDelay: `${delay}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════════

const tooltipStyle = {
  background: T.cardSolid, border: `1px solid ${T.border}`,
  borderRadius: 8, color: T.text, fontSize: 12,
};

function AnalyticsDashboard({ data }) {
  const { counts, msgs, avgScore, pie, trend, sessStats, topEmotions, total } = data;

  if (!data || total === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: T.textSub }}>
        <div style={{ fontSize: 48, opacity: 0.25 }}>📊</div>
        <p style={{ fontSize: 16, fontWeight: 500 }}>No analytics yet</p>
        <p style={{ fontSize: 13, color: T.textDim }}>Start a conversation to generate sentiment data</p>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Messages', value: msgs,           unit: '',   icon: '💬', color: T.accentBright },
    { label: 'Analyzed',       value: total,          unit: '',   icon: '🧠', color: T.neu          },
    { label: 'Positive',       value: counts.positive,unit: '',   icon: '😊', color: T.pos          },
    { label: 'Negative',       value: counts.negative,unit: '',   icon: '😔', color: T.neg          },
    { label: 'Avg Sentiment',  value: Math.abs(avgScore), unit: '%', icon: '📈', color: Number(avgScore) >= 0 ? T.pos : T.neg },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: T.bg }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: T.text, fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4 }}>
          Analytics
        </h2>
        <p style={{ color: T.textSub, fontSize: 14 }}>
          Sentiment patterns across {total} analyzed messages
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {statCards.map(c => (
          <div key={c.label} style={{
            background: T.cardSolid, border: `1px solid ${T.border}`,
            borderRadius: 13, padding: '16px 18px',
            borderTop: `2px solid ${c.color}40`,
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{c.icon}</div>
            <div style={{
              color: c.color, fontSize: 26, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
            }}>
              {c.value}{c.unit}
            </div>
            <div style={{ color: T.textSub, fontSize: 12, marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16, marginBottom: 16 }}>
        {/* Distribution pie */}
        <ChartCard title="Sentiment Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={72} innerRadius={42}
                paddingAngle={3}>
                {pie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                formatter={v => <span style={{ color: T.textSub, fontSize: 12 }}>{v}</span>}
                iconSize={8} iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Trend area */}
        <ChartCard title="Sentiment Trend" subtitle="Positive ↑ · Negative ↓ · Recent 20 messages">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={T.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={T.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="x" stroke={T.textDim} tick={{ fill: T.textDim, fontSize: 10 }} />
              <YAxis stroke={T.textDim} tick={{ fill: T.textDim, fontSize: 10 }} domain={[-100, 100]} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v.toFixed(0)}`, 'Score']} />
              <Area type="monotone" dataKey="v" stroke={T.accentBright} strokeWidth={2}
                fill="url(#trendGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16 }}>
        {/* Per-session bar chart */}
        <ChartCard title="Sentiment per Session">
          {sessStats.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sessStats} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="name" stroke={T.textDim} tick={{ fill: T.textDim, fontSize: 10 }} />
                <YAxis stroke={T.textDim} tick={{ fill: T.textDim, fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="pos" name="Positive" fill={T.pos}  radius={[3,3,0,0]} />
                <Bar dataKey="neg" name="Negative" fill={T.neg}  radius={[3,3,0,0]} />
                <Bar dataKey="neu" name="Neutral"  fill={T.neu}  radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Top emotions */}
        <ChartCard title="Top Emotions">
          {topEmotions.length === 0 ? <EmptyChart /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {topEmotions.map(([emotion, count], i) => {
                const colors = [T.pos, T.accentBright, T.pos, T.neg, T.neu, T.neg];
                return (
                  <div key={emotion}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: T.text, fontSize: 13, textTransform: 'capitalize' }}>
                        {emotion}
                      </span>
                      <span style={{ color: T.textSub, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        {count}×
                      </span>
                    </div>
                    <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: colors[i % colors.length],
                        width: `${(count / topEmotions[0][1]) * 100}%`,
                        transition: 'width 0.7s cubic-bezier(0.22,1,0.36,1)',
                        boxShadow: `0 0 6px ${colors[i % colors.length]}60`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: T.cardSolid, border: `1px solid ${T.border}`, borderRadius: 13, padding: 20,
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim, fontSize: 13 }}>
      No data yet
    </div>
  );
}
