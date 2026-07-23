"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AnswerPanel, { Citation, OwnedCard, QueryType, Yield } from "@/components/AnswerPanel";
import PipelineStepper, { Phase, StepDetail } from "@/components/PipelineStepper";
import { apiFetch, getToken, streamChat } from "@/lib/api";
import { clearConversation, loadConversation, pushConversationTurn } from "@/lib/conversation";
import { pushHistory } from "@/lib/history";

interface UserInfo { id: string; email: string; name: string; }

interface TurnState {
  query: string;
  queryType: QueryType;
  yields: Record<string, Yield>;
  citations: Citation[];
  recommendation: string;
  followUps: string[];
  at: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const NODE_INDEX: Record<string, number> = {
  classify_and_extract: 0,
  retrieve_rules: 1,
  retrieve_broad: 1,
  rerank: 2,
  calculate_math: 3,
  build_citations: 3,
  generate_response: 4,
  decline_off_topic: 4,
};

const EXAMPLES = [
  "₹2,500 dinner on Swiggy…",
  "What are my HDFC Infinia's benefits?…",
  "How do I maximize rewards across my cards?…",
  "₹1,299 Amazon order…",
  "Fuel at HPCL, ₹3,000…",
];

const QUICK_CHIPS = ["₹2,500 dinner on Swiggy", "How do I maximize rewards across my cards?", "₹2,000 Blinkit groceries"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([]);

  const [query, setQuery] = useState("");
  const [phIndex, setPhIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeStep, setActiveStep] = useState(-1);
  const [errorStep, setErrorStep] = useState(-1);
  const [details, setDetails] = useState<Record<number, StepDetail[]>>({});
  const [coldStart, setColdStart] = useState(false);
  const [liveQueryType, setLiveQueryType] = useState<QueryType | undefined>(undefined);
  const [banner, setBanner] = useState("");

  const [turns, setTurns] = useState<TurnState[]>([]);

  const activeStepRef = useRef(-1);
  const lastQueryRef = useRef("");
  const lastQueryAtRef = useRef("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    apiFetch<UserInfo>("/auth/me").then(setUser).catch(() => {});
    apiFetch<OwnedCard[]>("/users/me/cards").then(setOwnedCards).catch(() => {});
    const recalled = sessionStorage.getItem("recall_query");
    if (recalled) {
      sessionStorage.removeItem("recall_query");
      setQuery(recalled);
    }
  }, [router]);

  /* Cycling placeholder while idle */
  useEffect(() => {
    if (phase !== "idle") return;
    const t = setInterval(() => setPhIndex((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, [phase]);

  const setStep = (i: number) => {
    activeStepRef.current = i;
    setActiveStep(i);
  };

  const ask = useCallback(async (queryOverride?: string) => {
    const q = (queryOverride ?? query).trim();
    if (!q || phase === "running") return;
    lastQueryRef.current = q;
    lastQueryAtRef.current = new Date().toISOString();
    setBanner("");
    setPhase("running");
    setStep(0);
    setErrorStep(-1);
    setDetails({});
    setLiveQueryType(undefined);
    setColdStart(false);
    const coldTimer = setTimeout(() => setColdStart(true), 8000);

    let gotAnswer = false;
    let finalYields: Record<string, Yield> = {};
    let finalCitations: Citation[] = [];
    let finalRec = "";
    let finalFollowUps: string[] = [];
    let finalQueryType: QueryType = "purchase";

    try {
      const history = loadConversation();
      await streamChat(q, history, ({ node, update }) => {
        const i = NODE_INDEX[node];
        if (i === undefined) return;
        const u = update as Record<string, unknown>;

        if (node === "classify_and_extract") {
          clearTimeout(coldTimer);
          setColdStart(false);
          const qt = (u.query_type as QueryType) ?? "general";
          finalQueryType = qt;
          setLiveQueryType(qt);
          const merchant = String(u.extracted_merchant ?? "");
          const amount = Number(u.extracted_amount ?? 0);
          const chips: StepDetail[] = [];
          if (qt === "purchase" && merchant) chips.push({ text: merchant, kind: "accent" });
          if (qt === "purchase" && amount) chips.push({ text: `₹${amount.toLocaleString("en-IN")}`, kind: "accent" });
          setDetails((d) => ({ ...d, 0: chips }));
        }
        if (node === "retrieve_rules" || node === "retrieve_broad") {
          const rules = (u.retrieved_rules as unknown[]) ?? [];
          setDetails((d) => ({ ...d, 1: [{ text: `${rules.length} rules found`, kind: "plain" }] }));
        }
        if (node === "calculate_math") {
          finalYields = (u.calculated_yields as Record<string, Yield>) ?? {};
          setDetails((d) => ({ ...d, 3: [{ text: "Deterministic — no AI guessing", kind: "reward" }] }));
        }
        if (node === "build_citations") {
          finalCitations = (u.citations as Citation[]) ?? [];
          setDetails((d) => ({ ...d, 3: [{ text: `${finalCitations.length} source${finalCitations.length === 1 ? "" : "s"}`, kind: "plain" }] }));
        }
        if (node === "generate_response" || node === "decline_off_topic") {
          finalRec = String(u.final_recommendation ?? "");
          finalFollowUps = (u.follow_up_questions as string[]) ?? [];
          if (node === "decline_off_topic") {
            finalCitations = (u.citations as Citation[]) ?? [];
            finalYields = (u.calculated_yields as Record<string, Yield>) ?? {};
          }
          gotAnswer = true;
        }
        setStep(i + 1);
      });

      if (!gotAnswer) throw new Error("stream ended early");
      setPhase("done");

      setTurns((t) => [
        ...t,
        {
          query: q,
          queryType: finalQueryType,
          yields: finalYields,
          citations: finalCitations,
          recommendation: finalRec,
          followUps: finalFollowUps,
          at: lastQueryAtRef.current,
        },
      ]);
      pushConversationTurn({ role: "user", content: q });
      pushConversationTurn({ role: "assistant", content: finalRec });

      if (finalQueryType === "purchase") {
        const entries = Object.entries(finalYields).sort(
          ([, a], [, b]) => (b.estimated_reward ?? 0) - (a.estimated_reward ?? 0)
        );
        if (entries.length > 0) {
          const [name, w] = entries[0];
          pushHistory({
            q,
            winner: name,
            bank: name.split(" ")[0] ?? "",
            amount: w.estimated_reward,
            rate: w.rate,
            at: new Date().toISOString(),
          });
        }
      }

      // Turn is now archived in `turns` — clear the live/in-flight state and
      // reset the ask bar for the next question in this conversation.
      setQuery("");
      setPhase("idle");
      setStep(-1);
      setDetails({});
      setLiveQueryType(undefined);
    } catch {
      clearTimeout(coldTimer);
      setErrorStep(Math.max(0, activeStepRef.current));
      setPhase("error");
    }
  }, [query, phase]);

  const startNewConversation = () => {
    setTurns([]);
    clearConversation();
    setPhase("idle");
    setQuery("");
    setStep(-1);
    setDetails({});
    setLiveQueryType(undefined);
  };

  const running = phase === "running";
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div>
      <Nav email={user?.email} />
      <section className="container">
        <div className="fade-up" style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </div>
          <h2 className="page-title">{turns.length === 0 ? "What do you want to know?" : "Ask a follow-up"}</h2>
        </div>

        {/* ASK BAR */}
        <div style={{ animation: "fadeUp .55s var(--ease) .05s both" }}>
          <div className="ask-bar">
            <span style={{ color: "var(--faint)", fontSize: 18 }} aria-hidden>✦</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder={EXAMPLES[phIndex]}
              disabled={running}
              aria-label="Ask about your cards"
            />
            <button className={`ask-btn ${running ? "running" : ""}`} onClick={() => ask()} disabled={running || !query.trim()}>
              {running ? <span className="spinner" /> : <span>Ask →</span>}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
            {phase === "idle" && turns.length === 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {QUICK_CHIPS.map((c) => (
                  <button key={c} className="chip-btn" onClick={() => setQuery(c)}>{c}</button>
                ))}
              </div>
            )}
            {turns.length > 0 && (
              <button className="chip-btn" onClick={startNewConversation}>↺ Start new conversation</button>
            )}
          </div>
        </div>

        {banner && (
          <div className="error-banner" style={{ marginTop: 20 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,107,107,.18)", color: "var(--danger)", display: "grid", placeItems: "center", fontWeight: 700, flex: "none" }}>!</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Couldn&apos;t reach the reward engine</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{banner}</div>
            </div>
          </div>
        )}

        {/* No cards yet — nudge */}
        {phase === "idle" && turns.length === 0 && ownedCards.length === 0 && (
          <div className="panel fade-up" style={{ marginTop: 26, padding: "22px 24px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Add your cards first</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Answers are personalized to the cards you own — your wallet is empty right now.</div>
            </div>
            <a href="/cards" className="btn-primary" style={{ textDecoration: "none" }}>＋ Add cards</a>
          </div>
        )}

        {/* Completed turns — a running transcript */}
        {turns.map((t, idx) => {
          const isLast = idx === turns.length - 1 && phase !== "running";
          return (
            <div key={idx}>
              <div className="chat-row user">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "78%" }}>
                  <div className="bubble-user">{t.query}</div>
                  <span className="msg-time">{formatTime(t.at)}</span>
                </div>
              </div>
              <div className="chat-row assistant">
                <div style={{ maxWidth: "92%", width: "100%" }}>
                  <AnswerPanel
                    yields={t.yields}
                    citations={t.citations}
                    queryType={t.queryType}
                    ownedCards={ownedCards}
                    recommendation={t.recommendation}
                    onNewQuestion={() => {}}
                    hideActions
                    followUps={isLast ? t.followUps : undefined}
                    onFollowUp={isLast ? (q) => ask(q) : undefined}
                  />
                  <span className="msg-time">{formatTime(t.at)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Currently in-flight question */}
        {(phase === "running" || phase === "error") && (
          <>
            <div className="chat-row user">
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "78%" }}>
                <div className="bubble-user">{lastQueryRef.current}</div>
                <span className="msg-time">{formatTime(lastQueryAtRef.current)}</span>
              </div>
            </div>
            <div className="chat-row assistant">
              <div style={{ maxWidth: "92%", width: "100%" }}>
                <PipelineStepper
                  phase={phase}
                  activeStep={activeStep}
                  errorStep={errorStep}
                  details={details}
                  coldStart={coldStart}
                  queryType={liveQueryType}
                  onRetry={() => ask(lastQueryRef.current)}
                />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
