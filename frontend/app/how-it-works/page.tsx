"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getToken } from "@/lib/api";
import Nav from "@/components/Nav";

const PIPELINE = [
  {
    n: "01",
    title: "extract_intent",
    kind: "LLM call",
    desc: "Qwen3 reads your free-text query and pulls out a structured {merchant, amount} — the only place natural language enters the pipeline.",
    sample: { in: "“₹300 movie tickets on BookMyShow”", out: '{ "merchant": "bookmyshow", "amount": 300 }' },
  },
  {
    n: "02",
    title: "retrieve_rules",
    kind: "Vector search",
    desc: "Dense embedding search in Qdrant, hard-filtered by a payload condition on card_id ∈ your owned cards — you can never retrieve another user's rule text, at the query level, not the app level.",
    sample: { in: "query vector + owned_card_ids filter", out: "10 candidate rule chunks (yours only)" },
  },
  {
    n: "03",
    title: "rerank",
    kind: "Cross-encoder",
    desc: "Jina's reranker re-scores the 10 candidates against the actual query for relevance and keeps the top 3 — dense search alone tends to over-favor generic “rewards” language.",
    sample: { in: "10 candidates", out: "top 3, relevance-sorted" },
  },
  {
    n: "04",
    title: "calculate_math",
    kind: "Pure Python",
    desc: "Zero LLM involvement. Regexes pull advertised %/point rates out of the rule text and compute exact ₹ yield per card. Rules with no computable rate (flat discounts, BOGO deals) are kept as qualitative offers instead of being silently dropped.",
    sample: { in: "rule text + ₹amount", out: "{ HDFC Swiggy Card: ₹250 (10%) }" },
  },
  {
    n: "05",
    title: "generate_response",
    kind: "LLM call",
    desc: "Qwen3 turns the pre-computed numbers (or qualitative offer text) into a plain-English recommendation. It's instructed never to invent a rate that isn't already in the data.",
    sample: { in: "calculated_yields + qualitative_offers", out: "“Use your Swiggy Card — ₹250 back, 10% dining rate”" },
  },
];

const HLD_NODES = {
  client: { x: 40, y: 190, w: 150, h: 56, label: "Browser", sub: "Next.js SPA" },
  frontend: { x: 250, y: 190, w: 170, h: 56, label: "paywise-frontend", sub: "Cloud Run · Next.js 14" },
  backend: { x: 480, y: 190, w: 170, h: 56, label: "paywise-backend", sub: "Cloud Run · FastAPI + SSE" },
};

const HLD_SERVICES = [
  { label: "Qdrant Cloud", sub: "vector search, payload-filtered", y: 30 },
  { label: "Neon Postgres", sub: "users, cards, ownership", y: 96 },
  { label: "Jina AI", sub: "embeddings + reranker", y: 162 },
  { label: "Ollama Cloud", sub: "Qwen3 LLM (swappable)", y: 228 },
  { label: "Google OAuth", sub: "real sign-in, JWT session", y: 294 },
  { label: "Langfuse", sub: "trace every node, per query", y: 360 },
];

const CICD = [
  { label: "git push", sub: "developer machine" },
  { label: "GitHub", sub: "path-filtered triggers" },
  { label: "Cloud Build", sub: "build + push image" },
  { label: "Artifact Registry", sub: "keep last 3 tags" },
  { label: "Cloud Run", sub: "new revision live" },
];

const DECISIONS = [
  {
    t: "Math stays deterministic",
    d: "The ₹ number that actually matters never touches an LLM — it's regex + arithmetic over the rule text, so it's auditable and can't hallucinate.",
  },
  {
    t: "Per-user isolation at the query level",
    d: "Qdrant's payload filter restricts retrieval to your owned card_ids inside the search itself — not a post-filter in application code that could be forgotten.",
  },
  {
    t: "Lighter tools, chosen on purpose",
    d: "pypdf/python-docx over `unstructured` (tested against a real bank T&C PDF first), and a lightweight Langfuse @observe decorator instead of pulling in all of langchain for one CallbackHandler.",
  },
  {
    t: "Evals over vibes",
    d: "A 15-query golden dataset scores intent extraction, retrieval accuracy, and reward math independently — it already caught a real quota outage and a math-node edge case pre-launch.",
  },
];

export default function HowItWorksPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    setSignedIn(!!getToken());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActive((i) => (i + 1) % PIPELINE.length), 3200);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      {signedIn ? (
        <Nav />
      ) : (
        <nav className="nav">
          <Link href="/" className="brand" style={{ color: "var(--text)" }}>
            <div className="brand-mark"><div /></div>
            <span className="brand-name">
              PayWise<span style={{ color: "var(--accent)" }}>.</span>
            </span>
          </Link>
          <div style={{ flex: 1 }} />
          <Link href="/" className="chip-btn">← Back</Link>
        </nav>
      )}

      <div className="container-wide">
        <div className="fade-up" style={{ marginBottom: 54 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Under the hood</div>
          <h1
            style={{
              fontFamily: "var(--ff-num)", fontWeight: 700, fontSize: 42,
              letterSpacing: "-.03em", margin: "0 0 14px", lineHeight: 1.08,
            }}
          >
            How PayWise actually works
          </h1>
          <p style={{ fontSize: 16.5, color: "var(--muted)", maxWidth: 640, lineHeight: 1.6 }}>
            A LangGraph agent that turns a plain-English purchase into an auditable, math-backed
            card recommendation — five deterministic steps, traced end to end.
          </p>
        </div>

        {/* ---------------- HLD ---------------- */}
        <section style={{ marginBottom: 70 }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>High-level architecture</div>

          <div className="panel" style={{ padding: 28, marginBottom: 18, overflowX: "auto" }}>
            <svg viewBox="0 0 900 420" width="100%" style={{ minWidth: 760, display: "block" }}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
                </marker>
              </defs>

              {/* client -> frontend -> backend spine */}
              <path d="M190,218 H250" stroke="var(--border-2)" strokeWidth="2" markerEnd="url(#arrow)" fill="none" />
              <path d="M420,218 H480" stroke="var(--border-2)" strokeWidth="2" markerEnd="url(#arrow)" fill="none" />

              {/* animated pulse dots along the request path */}
              <circle r="4" fill="var(--accent)">
                <animateMotion dur="2.4s" repeatCount="indefinite" path="M190,218 H480" />
              </circle>

              {[HLD_NODES.client, HLD_NODES.frontend, HLD_NODES.backend].map((n) => (
                <g key={n.label} transform={`translate(${n.x},${n.y})`}>
                  <rect
                    width={n.w} height={n.h} rx="12"
                    fill="var(--surface-2)" stroke="var(--border-2)" strokeWidth="1.2"
                  />
                  <text x={n.w / 2} y={22} textAnchor="middle" fontSize="13.5" fontWeight="600" fill="var(--text)">
                    {n.label}
                  </text>
                  <text x={n.w / 2} y={40} textAnchor="middle" fontSize="11" fill="var(--muted)">
                    {n.sub}
                  </text>
                </g>
              ))}

              {/* backend -> external services fan-out */}
              {HLD_SERVICES.map((s, i) => {
                const startX = 650;
                const startY = 218;
                const endX = 700;
                const endY = s.y + 24;
                const midX = (startX + endX) / 2 + 30;
                const path = `M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`;
                return (
                  <g key={s.label}>
                    <path d={path} stroke="var(--border)" strokeWidth="1.4" fill="none" />
                    <circle r="3" fill="var(--reward)">
                      <animateMotion dur="3s" begin={`${i * 0.4}s`} repeatCount="indefinite" path={path} />
                    </circle>
                  </g>
                );
              })}

              {HLD_SERVICES.map((s) => (
                <g key={s.label} transform={`translate(700,${s.y})`}>
                  <rect width="180" height="48" rx="10" fill="var(--surface)" stroke="var(--border)" strokeWidth="1" />
                  <text x={14} y={20} fontSize="12.5" fontWeight="600" fill="var(--text)">{s.label}</text>
                  <text x={14} y={36} fontSize="10.5" fill="var(--muted)">{s.sub}</text>
                </g>
              ))}
            </svg>
          </div>

          <div className="panel" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 14, letterSpacing: ".08em", textTransform: "uppercase" }}>
              CI/CD — every push, not every laptop
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
              {CICD.map((c, i) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center" }}>
                  <div
                    className="chip"
                    style={{
                      padding: "10px 16px", display: "flex", flexDirection: "column", gap: 2,
                      background: "var(--surface-2)", border: "1px solid var(--border-2)",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.label}</span>
                    <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{c.sub}</span>
                  </div>
                  {i < CICD.length - 1 && (
                    <span style={{ margin: "0 10px", color: "var(--accent)", fontSize: 16, animation: "fadeIn 1s ease-in-out infinite alternate" }}>
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 14, lineHeight: 1.5 }}>
              Two path-filtered Cloud Build triggers watch this repo — a backend-only change never
              rebuilds the frontend image, and vice versa. Nothing reaches Cloud Run except through
              this pipeline.
            </p>
          </div>
        </section>

        {/* ---------------- LLD ---------------- */}
        <section style={{ marginBottom: 70 }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>Low-level: the 5-node LangGraph pipeline</div>

          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18 }}>
            <div className="panel" style={{ padding: "8px 6px" }}>
              {PIPELINE.map((p, i) => (
                <div
                  key={p.title}
                  onClick={() => setActive(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                    borderRadius: "var(--r-md)", cursor: "pointer",
                    background: active === i ? "var(--surface-2)" : "transparent",
                    border: active === i ? "1px solid var(--border-2)" : "1px solid transparent",
                    transition: "all var(--dur) var(--ease)",
                  }}
                >
                  <div
                    className={active === i ? "" : undefined}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
                      flex: "none", fontSize: 12, fontWeight: 700,
                      background: active === i ? "var(--reward)" : "var(--surface-3)",
                      color: active === i ? "var(--bg)" : "var(--faint)",
                      boxShadow: active === i ? "0 0 14px var(--reward-glow)" : "none",
                      transition: "all var(--dur) var(--ease)",
                    }}
                  >
                    {active === i ? "✓" : p.n}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="num" style={{ fontSize: 13.5, fontWeight: 600, color: active === i ? "var(--text)" : "var(--muted)" }}>
                      {p.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--faint)" }}>{p.kind}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="panel fade-up" key={active} style={{ padding: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="chip chip-accent num">{PIPELINE[active].n}</span>
                <span className="chip">{PIPELINE[active].kind}</span>
              </div>
              <h3 className="num" style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>
                {PIPELINE[active].title}
              </h3>
              <p style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.6, marginBottom: 22 }}>
                {PIPELINE[active].desc}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "center" }}>
                <div className="rule-quote" style={{ marginTop: 0 }}>
                  <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>in</div>
                  <div className="num" style={{ fontSize: 13, color: "var(--text)" }}>{PIPELINE[active].sample.in}</div>
                </div>
                <div style={{ color: "var(--accent)", fontSize: 20 }}>→</div>
                <div className="rule-quote" style={{ marginTop: 0, borderLeftColor: "var(--accent)" }}>
                  <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>out</div>
                  <div className="num" style={{ fontSize: 13, color: "var(--text)" }}>{PIPELINE[active].sample.out}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- Decisions ---------------- */}
        <section style={{ marginBottom: 70 }}>
          <div className="eyebrow" style={{ marginBottom: 18 }}>Engineering decisions</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }} className="how-grid">
            {DECISIONS.map((d) => (
              <div key={d.t} className="panel" style={{ padding: 22 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{d.t}</div>
                <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{d.d}</div>
              </div>
            ))}
          </div>
        </section>

        <div
          style={{
            borderRadius: "var(--r-lg)", padding: "26px 28px",
            background: "linear-gradient(120deg, rgba(55,227,164,.07), rgba(109,124,255,.07))",
            border: "1px solid var(--border)", display: "flex", gap: 18, alignItems: "center",
          }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center", flex: "none" }}>
            📈
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Every trace is public-API verifiable</div>
            <div style={{ fontSize: 14, color: "var(--muted)" }}>
              Each of the 5 nodes above is a real Langfuse span in production — latency, cost, and
              I/O per step, for every query that's ever been asked.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
