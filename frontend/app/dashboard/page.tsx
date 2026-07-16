"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import AnswerPanel, { OwnedCard, Yield } from "@/components/AnswerPanel";
import PipelineStepper, { Phase, StepDetail } from "@/components/PipelineStepper";
import { apiFetch, getToken, streamChat } from "@/lib/api";
import { pushHistory } from "@/lib/history";

interface UserInfo { id: string; email: string; name: string; }

const NODE_INDEX: Record<string, number> = {
  extract_intent: 0,
  retrieve_rules: 1,
  rerank: 2,
  calculate_math: 3,
  generate_response: 4,
};

const EXAMPLES = [
  "₹2,500 dinner on Swiggy…",
  "₹2,000 groceries on Blinkit…",
  "Flight to Goa, ₹8,500…",
  "₹1,299 Amazon order…",
  "Fuel at HPCL, ₹3,000…",
];

const QUICK_CHIPS = ["₹2,500 dinner on Swiggy", "₹8,500 flight to Goa", "₹2,000 Blinkit groceries"];

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
  const [yields, setYields] = useState<Record<string, Yield>>({});
  const [recommendation, setRecommendation] = useState("");
  const [banner, setBanner] = useState("");

  const activeStepRef = useRef(-1);
  const lastQueryRef = useRef("");

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
    setBanner("");
    setPhase("running");
    setStep(0);
    setErrorStep(-1);
    setDetails({});
    setYields({});
    setRecommendation("");
    setColdStart(false);
    const coldTimer = setTimeout(() => setColdStart(true), 8000);

    let gotAnswer = false;
    let finalYields: Record<string, Yield> = {};
    let finalRec = "";

    try {
      await streamChat(q, ({ node, update }) => {
        const i = NODE_INDEX[node];
        if (i === undefined) return;
        const u = update as Record<string, unknown>;

        if (node === "extract_intent") {
          clearTimeout(coldTimer);
          setColdStart(false);
          const merchant = String(u.extracted_merchant ?? "");
          const amount = Number(u.extracted_amount ?? 0);
          const chips: StepDetail[] = [];
          if (merchant) chips.push({ text: merchant, kind: "accent" });
          if (amount) chips.push({ text: `₹${amount.toLocaleString("en-IN")}`, kind: "accent" });
          setDetails((d) => ({ ...d, 0: chips }));
        }
        if (node === "retrieve_rules") {
          const rules = (u.retrieved_rules as unknown[]) ?? [];
          setDetails((d) => ({ ...d, 1: [{ text: `${rules.length} rules found`, kind: "plain" }] }));
        }
        if (node === "calculate_math") {
          finalYields = (u.calculated_yields as Record<string, Yield>) ?? {};
          setYields(finalYields);
          setDetails((d) => ({ ...d, 3: [{ text: "Deterministic — no AI guessing", kind: "reward" }] }));
        }
        if (node === "generate_response") {
          finalRec = String(u.final_recommendation ?? "");
          setRecommendation(finalRec);
          gotAnswer = true;
        }
        setStep(i + 1);
      });

      if (!gotAnswer) throw new Error("stream ended early");
      setPhase("done");

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
    } catch {
      clearTimeout(coldTimer);
      setErrorStep(Math.max(0, activeStepRef.current));
      setPhase("error");
    }
  }, [query, phase]);

  const newQuestion = () => {
    setPhase("idle");
    setQuery("");
    setStep(-1);
    setDetails({});
    setYields({});
    setRecommendation("");
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
          <h2 className="page-title">What are you buying?</h2>
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
              aria-label="Describe your purchase"
            />
            <button className={`ask-btn ${running ? "running" : ""}`} onClick={() => ask()} disabled={running || !query.trim()}>
              {running ? <span className="spinner" /> : <span>Ask →</span>}
            </button>
          </div>
          {phase === "idle" && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {QUICK_CHIPS.map((c) => (
                <button key={c} className="chip-btn" onClick={() => setQuery(c)}>{c}</button>
              ))}
            </div>
          )}
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
        {phase === "idle" && ownedCards.length === 0 && (
          <div className="panel fade-up" style={{ marginTop: 26, padding: "22px 24px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Add your cards first</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Answers are personalized to the cards you own — your wallet is empty right now.</div>
            </div>
            <a href="/cards" className="btn-primary" style={{ textDecoration: "none" }}>＋ Add cards</a>
          </div>
        )}

        <PipelineStepper
          phase={phase}
          activeStep={activeStep}
          errorStep={errorStep}
          details={details}
          coldStart={coldStart}
          onRetry={() => ask(lastQueryRef.current)}
        />

        {phase === "done" && (
          <AnswerPanel
            yields={yields}
            ownedCards={ownedCards}
            recommendation={recommendation}
            onNewQuestion={newQuestion}
          />
        )}
      </section>
    </div>
  );
}
