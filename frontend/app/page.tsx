"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, getToken } from "@/lib/api";

const HOW_IT_WORKS = [
  { n: "01", t: "Add your cards", d: "Pick from a catalog of Indian cards — no numbers, no linking. Just “I own this.”" },
  { n: "02", t: "Ask anything", d: "“₹2,500 dinner on Swiggy” — plain words, any merchant, any amount." },
  { n: "03", t: "Get the math", d: "The winning card, the exact ₹, and the bank rule that proves it." },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  return (
    <div>
      <nav className="nav">
        <div className="brand">
          <div className="brand-mark"><div /></div>
          <span className="brand-name">PayWise<span style={{ color: "var(--accent)" }}>.</span></span>
        </div>
        <div style={{ flex: 1 }} />
        <a href="/how-it-works" className="nav-tab">How it works</a>
      </nav>

      <section style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px" }}>
        <div
          className="hero-grid"
          style={{
            display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 40,
            alignItems: "center", minHeight: "calc(100vh - 60px)", padding: "40px 0",
          }}
        >
          <div style={{ animation: "fadeUp .7s var(--ease) both" }}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px",
                borderRadius: 99, background: "var(--surface)", border: "1px solid var(--border)",
                fontSize: 12.5, color: "var(--muted)", marginBottom: 26,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--reward)", boxShadow: "0 0 8px var(--reward-glow)" }} />
              Math-backed, not AI guesswork
            </div>
            <h1
              className="hero-h1"
              style={{
                fontFamily: "var(--ff-num)", fontWeight: 700, fontSize: 60,
                lineHeight: 1.02, letterSpacing: "-.03em", margin: "0 0 20px",
              }}
            >
              Which card should you<br />
              <span
                style={{
                  background: "linear-gradient(100deg, var(--accent), var(--reward))",
                  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                }}
              >
                actually
              </span>{" "}
              pay with?
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: "var(--muted)", maxWidth: 460, margin: "0 0 34px" }}>
              Ask in plain words. We read your cards&apos; real reward terms, compute the exact
              cashback for each, and tell you the winner — with the rule quoted as proof.
            </p>
            <a className="btn-white" href={`${API_BASE}/auth/google/login`} style={{ textDecoration: "none" }}>
              <span className="google-dot" />
              Continue with Google
            </a>
          </div>

          {/* Hero visual — floating generated cards + result popup */}
          <div className="hero-visual" style={{ position: "relative", height: 520 }}>
            <div
              style={{
                position: "absolute", inset: 0, filter: "blur(50px)", opacity: 0.55,
                background: "radial-gradient(circle at 50% 45%, var(--accent-glow), transparent 60%)",
                animation: "gradShift 9s ease-in-out infinite",
              }}
            />
            <div style={{ ["--rot" as string]: "-9deg", position: "absolute", top: 120, left: 0, width: 270, animation: "floaty 7s ease-in-out infinite" }}>
              <div style={{ height: 168, borderRadius: 16, background: "linear-gradient(135deg,#1e2a5e,#0f1734)", border: "1px solid var(--border-2)", boxShadow: "var(--shadow)", padding: 16, transform: "rotate(-9deg)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>HDFC BANK</div>
                <div className="num" style={{ letterSpacing: 2, marginTop: 38, fontSize: 15, color: "rgba(255,255,255,.85)" }}>•••• 4291</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>Swiggy Card</span>
                  <span className="num" style={{ fontStyle: "italic", fontWeight: 700, color: "#fff" }}>VISA</span>
                </div>
              </div>
            </div>
            <div style={{ ["--rot" as string]: "7deg", position: "absolute", top: 60, right: 10, width: 270, animation: "floaty 8s ease-in-out infinite .8s" }}>
              <div style={{ height: 168, borderRadius: 16, background: "linear-gradient(135deg,#5a1f3a,#2a0f22)", border: "1px solid var(--border-2)", boxShadow: "var(--shadow)", padding: 16, transform: "rotate(7deg)" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>AXIS BANK</div>
                <div className="num" style={{ letterSpacing: 2, marginTop: 38, fontSize: 15, color: "rgba(255,255,255,.85)" }}>•••• 8807</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>Ace</span>
                  <span className="num" style={{ fontWeight: 700, color: "#fff" }}>MC</span>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", width: 330, animation: "pop .8s var(--ease-spring) .5s both" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: "var(--r-lg)", padding: 18, boxShadow: "var(--shadow)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>₹2,500 dinner on Swiggy →</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 11, background: "linear-gradient(135deg,#1e2a5e,#0f1734)", flex: "none", border: "1px solid var(--border)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>HDFC Swiggy Card</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>10% back · rule verified</div>
                  </div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 24, color: "var(--reward)", textShadow: "0 0 20px var(--reward-glow)" }}>₹250</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 0 90px" }}>
          <div className="eyebrow" style={{ textAlign: "center", letterSpacing: ".14em", marginBottom: 34, fontSize: 13 }}>How it works</div>
          <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
            {HOW_IT_WORKS.map((h) => (
              <div key={h.n} className="panel" style={{ padding: 26 }}>
                <div className="num" style={{ fontSize: 14, color: "var(--accent)", fontWeight: 600 }}>{h.n}</div>
                <div style={{ fontSize: 17, fontWeight: 600, margin: "12px 0 8px" }}>{h.t}</div>
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>{h.d}</div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 22, borderRadius: "var(--r-lg)", padding: "26px 28px",
              background: "linear-gradient(120deg, rgba(55,227,164,.07), rgba(109,124,255,.07))",
              border: "1px solid var(--border)", display: "flex", gap: 18, alignItems: "center",
            }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center", flex: "none" }}>
              🛡️
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>We compute from the banks&apos; actual T&amp;Cs</div>
              <div style={{ fontSize: 14, color: "var(--muted)" }}>
                The reward math is deterministic — every ₹ we show is traced to a specific rule clause, never an AI guess.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
