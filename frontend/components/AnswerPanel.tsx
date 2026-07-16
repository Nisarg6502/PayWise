"use client";

import { useEffect, useRef, useState } from "react";
import CardVisual from "@/components/CardVisual";
import { cardBg, seedFromId } from "@/lib/cardTheme";
import { renderMarkdown } from "@/lib/markdown";

export interface Yield {
  card_id: string;
  rate: number;
  estimated_reward: number | null;
  rule_section: string;
  rule_text: string;
}

export interface OwnedCard {
  id: string;
  bank_name: string;
  card_name: string;
  network: string;
}

interface Props {
  yields: Record<string, Yield>;
  ownedCards: OwnedCard[];
  recommendation: string;
  onNewQuestion: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export default function AnswerPanel({ yields, ownedCards, recommendation, onNewQuestion }: Props) {
  const entries = Object.entries(yields).sort(
    ([, a], [, b]) => (b.estimated_reward ?? b.rate * 100) - (a.estimated_reward ?? a.rate * 100)
  );
  const [countUp, setCountUp] = useState(0);
  const [revealBars, setRevealBars] = useState(false);
  const raf = useRef<number>();

  const winner = entries[0];
  const winnerAmount = winner?.[1].estimated_reward ?? 0;

  useEffect(() => {
    const target = winnerAmount;
    const dur = 900;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setCountUp(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    const barTimer = setTimeout(() => setRevealBars(true), 120);
    // rAF doesn't fire in hidden/backgrounded tabs — snap to the final value regardless
    const snapTimer = setTimeout(() => setCountUp(target), dur + 300);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(barTimer);
      clearTimeout(snapTimer);
    };
  }, [winnerAmount]);

  const cardFor = (y: Yield, fallbackName: string): OwnedCard =>
    ownedCards.find((c) => c.id === y.card_id) ?? {
      id: y.card_id,
      bank_name: fallbackName.split(" ")[0] ?? "",
      card_name: fallbackName,
      network: "",
    };

  /* No applicable rules — graceful state */
  if (entries.length === 0) {
    return (
      <div className="fade-up" style={{ marginTop: 26 }}>
        <div className="panel" style={{ padding: 26 }}>
          <div style={{ fontFamily: "var(--ff-num)", fontSize: 19, fontWeight: 600, marginBottom: 8 }}>
            No reward rule matched this purchase
          </div>
          {recommendation && (
            <div className="md" style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.55 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(recommendation) }} />
          )}
        </div>
        <button className="btn-secondary" style={{ marginTop: 24 }} onClick={onNewQuestion}>＋ Ask a new question</button>
      </div>
    );
  }

  const [winnerName, w] = winner;
  const wCard = cardFor(w, winnerName);
  const maxAmt = Math.max(...entries.map(([, y]) => y.estimated_reward ?? 0), 1);
  const runners = entries.slice(1);

  return (
    <div className="fade-up" style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--reward)", fontWeight: 600 }}>
          Use this card
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      {/* WINNER */}
      <div
        style={{
          position: "relative", background: "var(--surface)", border: "1px solid var(--border-2)",
          borderRadius: "var(--r-xl)", padding: 26, overflow: "hidden", boxShadow: "var(--shadow)",
        }}
      >
        <div
          style={{
            position: "absolute", top: "-40%", right: "-10%", width: 340, height: 340,
            background: "radial-gradient(circle, var(--reward-glow), transparent 62%)",
            filter: "blur(40px)", opacity: 0.5, pointerEvents: "none",
          }}
        />
        <div className="winner-flex" style={{ position: "relative", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <CardVisual
            bank={wCard.bank_name} card={wCard.card_name} network={wCard.network}
            seed={seedFromId(wCard.id)} size="compact"
          />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>You&apos;ll earn</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "2px 0 6px", flexWrap: "wrap" }}>
              <span
                className="num"
                style={{
                  fontSize: 52, fontWeight: 700, lineHeight: 1, color: "var(--reward)",
                  textShadow: "0 0 34px var(--reward-glow)",
                }}
              >
                ₹{fmt(countUp)}
              </span>
              <span
                className="num"
                style={{
                  fontSize: 16, fontWeight: 600, color: "var(--reward-dim)",
                  background: "rgba(55,227,164,.1)", padding: "4px 10px", borderRadius: 8,
                }}
              >
                {(w.rate * 100).toFixed(w.rate * 100 % 1 ? 1 : 0)}% back
              </span>
            </div>
            {recommendation && (
              <div className="md" style={{ fontSize: 14.5, color: "var(--text)", lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(recommendation) }} />
            )}
          </div>
        </div>
        <div className="rule-quote" style={{ position: "relative" }}>
          <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 5 }}>
            {w.rule_section || `${winnerName} · reward rule`}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5 }}>
            “{w.rule_text}”
          </div>
        </div>
      </div>

      {/* COMPARISON */}
      {runners.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>If you used another card</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {runners.map(([name, y], i) => {
              const c = cardFor(y, name);
              return (
                <div key={name} className="panel" style={{ borderRadius: "var(--r-md)", padding: "15px 17px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, flex: "none", border: "1px solid var(--border)", background: cardBg(c.bank_name) }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{c.card_name}</div>
                      <div style={{ fontSize: 12, color: "var(--faint)" }}>
                        {c.bank_name} · {(y.rate * 100).toFixed(y.rate * 100 % 1 ? 1 : 0)}%
                      </div>
                    </div>
                    <div className="num" style={{ fontSize: 19, fontWeight: 600, color: "var(--muted)" }}>
                      {y.estimated_reward != null ? `₹${fmt(y.estimated_reward)}` : "—"}
                    </div>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: revealBars ? `${Math.round(((y.estimated_reward ?? 0) / maxAmt) * 100)}%` : "0%",
                        transitionDelay: `${i * 0.12}s`,
                      }}
                    />
                  </div>
                  <details style={{ marginTop: 11 }}>
                    <summary style={{ fontSize: 12, color: "var(--faint)", cursor: "pointer", listStyle: "none" }}>
                      {y.rule_section || "Reward rule"} ↓
                    </summary>
                    <div style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.5, marginTop: 8, paddingLeft: 11, borderLeft: "2px solid var(--border)" }}>
                      “{y.rule_text}”
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button className="btn-secondary" style={{ marginTop: 24 }} onClick={onNewQuestion}>
        ＋ Ask a new question
      </button>
    </div>
  );
}
