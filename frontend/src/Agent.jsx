import React, { useMemo, useRef, useState } from "react";
import {
  Brain,
  Send,
  Loader2,
  AlertTriangle,
  MessageSquare,
  History,
  RefreshCw,
  Play,
} from "lucide-react";

/**
 * Front-End Interface for Multi-LLM Collaborative Agent
 * - Submit a query
 * - Choose models (specialties)
 * - Watch collaboration timeline
 * - See initial + final outputs per model
 * - Give per-model feedback
 * - View synthesized final insight
 *
 * Endpoints (toggle Demo Mode to run without a backend):
 *   POST /api/run-agent   { query, models? }
 *     -> { models: [{ name, specialty, initial_output, final_output }...],
 *          synthesized_insight }
 *   POST /api/feedback    { model, feedback } -> { status: "ok" }
 */

const API_BASE = "http://127.0.0.1:8000/api";

// ------- Real API helpers -------
async function runAgentAPI(query, selectedModels) {
  const res = await fetch(`${API_BASE}/run-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, models: selectedModels }),
  });
  if (!res.ok) throw new Error(`/run-agent failed: HTTP ${res.status}`);
  return res.json();
}
async function sendFeedbackAPI(model, feedback) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, feedback }),
  });
  if (!res.ok) throw new Error(`feedback failed: HTTP ${res.status}`);
  return res.json();
}

// ------- Mock (Demo Mode) -------
function mockRunAgent(query, chosen) {
  const all = [
    {
      name: "Model A",
      specialty: "Math",
      initial_output: `Parsed the math parts of: ${query}`,
      final_output: `Solved key equations and verified edge cases.`,
    },
    {
      name: "Model B",
      specialty: "Science",
      initial_output: `Highlighted scientific context for: ${query}`,
      final_output: `Validated claims against known literature.`,
    },
    {
      name: "Model C",
      specialty: "Reasoning",
      initial_output: `Outlined reasoning plan for: ${query}`,
      final_output: `Resolved conflicts and provided caveats.`,
    },
  ];
  const models = (chosen?.length ? all.filter(m => chosen.includes(m.name)) : all).map(m => ({ ...m }));
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        models,
        synthesized_insight: `Final combined answer for: "${query}" — result reconciles math correctness, scientific context, and reasoning trade-offs.`,
      });
    }, 1200);
  });
}

// ------- Local storage helpers -------
const LS_SESSIONS_KEY = "mlca.sessions.v1";
const LS_FEEDBACK_KEY = "mlca.feedback.v1";
const loadFromLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const saveToLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ------- Small atoms -------
function Badge({ children }) {
  return (
    <span className="inline-block rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700 bg-white/70">
      {children}
    </span>
  );
}
function Arrow() {
  return (
    <svg width="48" height="24" viewBox="0 0 48 24" aria-hidden className="mx-2 text-slate-400">
      <path d="M2 12 H40" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M40 6 L46 12 L40 18 Z" fill="currentColor" />
    </svg>
  );
}
function TimelineItem({ t, i }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-0.5">
        <div className="w-2 h-2 rounded-full bg-slate-500" />
        {i < 99 && <div className="w-px h-6 bg-slate-200 mx-auto" />}
      </div>
      <div>
        <div className="text-sm font-medium text-slate-800">{t.title}</div>
        <div className="text-xs text-slate-500">{t.time}</div>
        {t.note && <div className="mt-1 text-sm text-slate-600">{t.note}</div>}
      </div>
    </div>
  );
}

// =================== Main Component ===================
export default function Agent() {
  // Initial state
  const [query, setQuery] = useState("");
  const defaultModels = useMemo(
    () => [
      { name: "Model A", specialty: "Math" },
      { name: "Model B", specialty: "Science" },
      { name: "Model C", specialty: "Reasoning" }, // <-- You can remove or rename this
    ],
    []
  );
  const [selectedModels, setSelectedModels] = useState(defaultModels.map(m => m.name));
  const [useMock, setUseMock] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [timeline, setTimeline] = useState([]);

  const [sessions, setSessions] = useState(() => loadFromLS(LS_SESSIONS_KEY, []));
  const [feedbackHistory, setFeedbackHistory] = useState(() => loadFromLS(LS_FEEDBACK_KEY, []));
  const [submitting, setSubmitting] = useState({});

  // Actions
  const runAgent = async () => {
    setError("");
    if (!query.trim()) {
      setError("Please enter a question or request.");
      return;
    }
    setLoading(true);
    setResult(null);
    setTimeline([]);

    const startedAt = new Date();
    const mkTime = (offset = 0) => new Date(startedAt.getTime() + offset).toLocaleTimeString();
    const steps = [
      { title: "Assigned tasks to selected models", note: selectedModels.join(", "), time: mkTime(0) },
      { title: "Models generated initial outputs", note: "Draft answers are ready", time: mkTime(400) },
      { title: "Cross-review & collaboration", note: "Models read each other and refine", time: mkTime(800) },
      { title: "Synthesizer merged results", note: "Conflicts resolved, caveats added", time: mkTime(1200) },
    ];
    setTimeline([steps[0]]);
    const t1 = setTimeout(() => setTimeline(s => [...s, steps[1]]), 300);
    const t2 = setTimeout(() => setTimeline(s => [...s, steps[2]]), 700);
    const t3 = setTimeout(() => setTimeline(s => [...s, steps[3]]), 1100);

    try {
      const data = useMock ? await mockRunAgent(query, selectedModels) : await runAgentAPI(query, selectedModels);
      setResult(data);

      const snapshot = {
        id: `${Date.now()}`,
        when: new Date().toISOString(),
        query,
        selectedModels: [...selectedModels],
        response: data,
      };
      const next = [snapshot, ...sessions].slice(0, 20);
      setSessions(next);
      saveToLS(LS_SESSIONS_KEY, next);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    }
  };

  const toggleModel = (name) => {
    setSelectedModels((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  };

  const submitFeedback = async (model, feedback) => {
    if (!feedback?.trim()) return;
    setSubmitting((s) => ({ ...s, [model]: true }));
    try {
      const res = useMock ? { status: "ok" } : await sendFeedbackAPI(model, feedback);
      if (res?.status === "ok") {
        const item = { id: `${Date.now()}`, when: new Date().toISOString(), model, feedback };
        const next = [item, ...feedbackHistory].slice(0, 100);
        setFeedbackHistory(next);
        saveToLS(LS_FEEDBACK_KEY, next);
        alert(`Thanks! Feedback recorded for ${model}.`);
      } else {
        alert("Feedback not saved — unexpected response.");
      }
    } catch (e) {
      alert(e?.message || "Failed to submit feedback.");
    } finally {
      setSubmitting((s) => ({ ...s, [model]: false }));
    }
  };

  const restoreSession = (s) => {
    setQuery(s.query);
    setSelectedModels(s.selectedModels);
    setResult(s.response);
    setError("");
    setTimeline([]);
  };

  const available = defaultModels;
  const chosenObjects = available.filter((m) => selectedModels.includes(m.name));

  // ---------------- UI ----------------
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 antialiased">
      <header className="sticky top-0 z-10 bg-gradient-to-r from-white to-slate-50/70 backdrop-blur border-b border-slate-200/70">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-2">
          <Brain className="w-6 h-6" />
          <h1 className="text-2xl font-bold tracking-tight">Multi-LLM Collaborative Agent</h1>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-slate-800"
                checked={useMock}
                onChange={() => setUseMock((v) => !v)}
              />
              <span className="select-none">Demo Mode</span>
            </label>
            <button
              onClick={() => {
                setQuery("");
                setResult(null);
                setTimeline([]);
                setError("");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
            >
              <RefreshCw className="w-4 h-4" /> Reset
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <section className="lg:col-span-2 space-y-6">
          {/* Query */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-tight">Ask a question</h2>
            </div>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-white p-3 outline-none focus:ring-4 focus:ring-slate-200/80 min-h-[120px] transition-shadow"
              placeholder='e.g., Compare the trade-offs of solar vs. wind power for a coastal city and provide a concise recommendation.'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              {/* Model chooser */}
              <div className="flex items-center gap-2 flex-wrap">
                {available.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => toggleModel(m.name)}
                    className={`text-sm rounded-full border px-3 py-1.5 transition-colors ${
                      selectedModels.includes(m.name)
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                    }`}
                  >
                    {m.name} <span className="opacity-70">· {m.specialty}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={runAgent}
                disabled={loading}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? "Running…" : "Run Agent"}
              </button>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}
          </div>

          {/* Flow visualization */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-tight">Collaboration Flow</h2>
            </div>
            <div className="flex items-center overflow-x-auto py-2">
              {chosenObjects.map((m, idx) => (
                <React.Fragment key={m.name}>
                  <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-sm font-semibold">{m.name}</div>
                    <div className="text-xs text-slate-600">{m.specialty}</div>
                  </div>
                  {idx < chosenObjects.length - 1 && <Arrow />}
                </React.Fragment>
              ))}
              {chosenObjects.length > 0 && <Arrow />}
              <div className="min-w-[180px] rounded-xl border border-slate-900 bg-slate-900 text-white px-4 py-3 shadow-sm">
                <div className="text-sm font-semibold">Synthesizer</div>
                <div className="text-xs opacity-80">Merges & reconciles</div>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-tight">Live Collaboration Timeline</h2>
            </div>
            {!timeline.length && (
              <div className="text-sm text-slate-500">
                Run the agent to see collaboration steps populate here.
              </div>
            )}
            <div className="space-y-4">
              {timeline.map((t, i) => (
                <TimelineItem key={i} t={t} i={i} />
              ))}
            </div>
          </div>
        </section>

        {/* Right column */}
        <aside className="space-y-6">
          {/* Synthesized insight */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-tight">Synthesized Insight</h2>
            </div>
            {!result ? (
              <div className="text-sm text-slate-500">Final combined answer will appear here after a run.</div>
            ) : (
              <div className="text-sm leading-6 whitespace-pre-wrap">
                {result.synthesized_insight}
              </div>
            )}
          </div>

          {/* Per-model outputs + feedback */}
          <div className="space-y-4">
            {loading && !result && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse">
                <div className="h-4 w-2/3 bg-slate-200 rounded mb-3" />
                <div className="h-3 w-5/6 bg-slate-200 rounded mb-2" />
                <div className="h-3 w-4/6 bg-slate-200 rounded mb-2" />
                <div className="h-3 w-3/6 bg-slate-200 rounded" />
              </div>
            )}

            {result?.models?.map((m) => (
              <div
                key={m.name}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">{m.name}</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Specialty: <Badge>{m.specialty}</Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-sm">
                  <div className="text-slate-500 font-medium mb-1">Initial Output</div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">
                    {m.initial_output}
                  </div>
                </div>
                <div className="mt-3 text-sm">
                  <div className="text-slate-500 font-medium mb-1">After Collaboration</div>
                  <div className="rounded-lg border border-slate-200 bg-emerald-50/70 p-3 whitespace-pre-wrap">
                    {m.final_output}
                  </div>
                </div>

                <ModelFeedbackBox
                  model={m.name}
                  onSubmit={submitFeedback}
                  submitting={!!submitting[m.name]}
                />
              </div>
            ))}
          </div>

          {/* Session history */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-tight">Session History</h2>
            </div>
            {!sessions.length ? (
              <div className="text-sm text-slate-500">
                Your last 20 runs will appear here for quick restore.
              </div>
            ) : (
              <ul className="space-y-2 text-sm">
                {sessions.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate max-w-[220px]" title={s.query}>
                        {s.query}
                      </div>
                      <button
                        onClick={() => restoreSession(s)}
                        className="text-slate-700 hover:underline"
                      >
                        Restore
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {new Date(s.when).toLocaleString()} · {s.selectedModels.join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Feedback history */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-5 h-5" />
              <h2 className="text-lg font-semibold tracking-tight">Feedback History</h2>
            </div>
            {!feedbackHistory.length ? (
              <div className="text-sm text-slate-500">Any feedback you submit will be listed here.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {feedbackHistory.map((f) => (
                  <li key={f.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{f.model}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(f.when).toLocaleString()}
                      </div>
                    </div>
                    <div className="mt-1 text-slate-700 whitespace-pre-wrap">{f.feedback}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-slate-500">
        <div className="opacity-70">
          Tip: toggle <strong>Demo Mode</strong> if you don't have a backend yet.
        </div>
      </footer>
    </div>
  );
}

function ModelFeedbackBox({ model, onSubmit, submitting }) {
  const [text, setText] = useState("");
  const ref = useRef(null);
  const handle = () => {
    const val = text.trim();
    if (!val) return;
    onSubmit(model, val);
    setText("");
    ref?.current?.focus();
  };
  return (
    <div className="mt-4">
      <div className="text-sm text-slate-600 mb-1">
        Give feedback to <span className="font-medium">{model}</span>
      </div>
      <div className="flex items-start gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g., Cite a source for claim #2, and shorten the recommendation to ≤ 3 sentences."
          className="flex-1 rounded-xl border border-slate-200 bg-white p-3 text-sm focus:ring-4 focus:ring-slate-200/80 min-h-[88px] transition-shadow"
        />
        <button
          onClick={handle}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-3 py-2 h-[88px] hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 transition-all"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
