"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { apiFetch, getToken } from "@/lib/api";
import { cardBg } from "@/lib/cardTheme";
import { HistoryEntry, loadHistory, timeAgo } from "@/lib/history";

interface UserInfo { id: string; email: string; name: string; }

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    apiFetch<UserInfo>("/auth/me").then(setUser).catch(() => {});
    setHistory(loadHistory());
  }, [router]);

  const total = history.reduce((s, h) => s + (h.amount ?? 0), 0);
  const winnerCounts = history.reduce<Record<string, number>>((acc, h) => {
    acc[h.winner] = (acc[h.winner] ?? 0) + 1;
    return acc;
  }, {});
  const top = Object.entries(winnerCounts).sort(([, a], [, b]) => b - a)[0];
  const avgRate = history.length
    ? (history.reduce((s, h) => s + h.rate, 0) / history.length) * 100
    : 0;

  const monthLabel = new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });

  const stats = [
    { label: "Potential rewards", value: `₹${fmt(total)}`, sub: `across ${history.length} question${history.length === 1 ? "" : "s"}`, color: "var(--reward)", glow: "var(--reward-glow)" },
    { label: "Most recommended", value: top ? top[0].split(" ").slice(-2).join(" ") : "—", sub: top ? `${top[1]} win${top[1] > 1 ? "s" : ""}` : "ask something first", color: "var(--text)", glow: "var(--accent-glow)" },
    { label: "Avg. effective rate", value: history.length ? `${avgRate.toFixed(1)}%` : "—", sub: "vs ~1% picking at random", color: "var(--accent)", glow: "var(--accent-glow)" },
  ];

  const recall = (q: string) => {
    sessionStorage.setItem("recall_query", q);
    router.push("/dashboard");
  };

  return (
    <div>
      <Nav email={user?.email} />
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "44px 24px 120px" }}>
        <div className="fade-up" style={{ marginBottom: 26 }}>
          <h2 className="page-title">Insights</h2>
          <div className="page-sub">{monthLabel} · this browser</div>
        </div>

        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 30 }}>
          {stats.map((k) => (
            <div key={k.label} className="panel" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -30, right: -20, width: 120, height: 120, background: `radial-gradient(circle, ${k.glow}, transparent 65%)`, filter: "blur(24px)", opacity: 0.5 }} />
              <div style={{ position: "relative", fontSize: 12.5, color: "var(--muted)" }}>{k.label}</div>
              <div className="num" style={{ position: "relative", fontSize: 30, fontWeight: 700, marginTop: 8, color: k.color }}>{k.value}</div>
              <div style={{ position: "relative", fontSize: 12, color: "var(--faint)", marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="eyebrow" style={{ marginBottom: 14 }}>Recent questions</div>
        {history.length === 0 ? (
          <div className="panel" style={{ padding: "36px 24px", textAlign: "center" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Nothing here yet</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 18 }}>
              Ask the optimizer something and your questions will collect here.
            </div>
            <a href="/dashboard" className="btn-primary" style={{ textDecoration: "none" }}>Ask a question</a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((h, i) => (
              <button
                key={`${h.at}-${i}`}
                onClick={() => recall(h.q)}
                className="panel"
                style={{
                  textAlign: "left", display: "flex", alignItems: "center", gap: 15,
                  borderRadius: "var(--r-md)", padding: "14px 17px", cursor: "pointer",
                  color: "var(--text)", transition: "all var(--dur) var(--ease)",
                }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 9, flex: "none", border: "1px solid var(--border)", background: cardBg(h.bank) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.q}</div>
                  <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>{h.winner} · {timeAgo(h.at)}</div>
                </div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600, color: "var(--reward)" }}>
                  {h.amount != null ? `₹${fmt(h.amount)}` : "—"}
                </div>
                <span style={{ color: "var(--faint)", fontSize: 16 }} aria-hidden>↻</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
