"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(8);

  useEffect(() => {
    // Backend redirects here with #token=<jwt> in the URL fragment
    const hash = window.location.hash;
    const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
    if (!token) {
      setError("No token received from the server.");
      return;
    }
    setToken(token);
    const steps: [number, number][] = [[250, 40], [550, 72], [850, 96]];
    const timers = steps.map(([t, p]) => setTimeout(() => setPct(p), t));
    timers.push(setTimeout(() => router.replace("/dashboard"), 1100));
    return () => timers.forEach(clearTimeout);
  }, [router]);

  return (
    <section style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", animation: "fadeIn .4s var(--ease) both" }}>
        <div style={{ position: "relative", width: 96, height: 96, margin: "0 auto 30px" }}>
          <div
            style={{
              position: "absolute", inset: -14, borderRadius: "50%",
              background: "radial-gradient(circle, var(--accent-glow), transparent 65%)",
              filter: "blur(14px)", animation: "breathe 2.4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              width: 96, height: 96, borderRadius: 26,
              background: "conic-gradient(from 140deg, var(--accent), var(--reward), var(--accent-2), var(--accent))",
              display: "grid", placeItems: "center", animation: "assemble .6s var(--ease-spring) both",
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--bg)" }} />
          </div>
        </div>
        {error ? (
          <>
            <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>Sign-in hiccup</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 8 }}>{error}</div>
            <a href="/" className="btn-secondary" style={{ marginTop: 22, display: "inline-flex" }}>Back to start</a>
          </>
        ) : (
          <>
            <div className="num" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>
              Signing you in
              <span style={{ display: "inline-flex", gap: 3, marginLeft: 4 }}>
                <span style={{ animation: "dots 1.4s infinite" }}>.</span>
                <span style={{ animation: "dots 1.4s infinite .2s" }}>.</span>
                <span style={{ animation: "dots 1.4s infinite .4s" }}>.</span>
              </span>
            </div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 8 }}>Redirecting through Google and back</div>
            <div style={{ width: 220, height: 3, borderRadius: 99, background: "var(--surface-3)", margin: "26px auto 0", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%", width: `${pct}%`, borderRadius: 99,
                  background: "linear-gradient(90deg, var(--accent), var(--reward))",
                  transition: "width .4s var(--ease)",
                }}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
