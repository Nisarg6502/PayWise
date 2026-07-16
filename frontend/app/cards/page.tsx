"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import CardVisual from "@/components/CardVisual";
import Toast from "@/components/Toast";
import { apiFetch, apiFetchForm, getToken } from "@/lib/api";
import { cardBg, networkBadge, seedFromId } from "@/lib/cardTheme";

interface Card { id: string; bank_name: string; card_name: string; network: string; }
interface UserInfo { id: string; email: string; name: string; }

const NETWORKS = ["Visa", "Mastercard", "RuPay", "American Express", "Diners Club", "Other"];

type ModalMode = "browse" | "create" | "rules";

export default function CardsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [catalog, setCatalog] = useState<Card[] | null>(null);
  const [wallet, setWallet] = useState<Card[] | null>(null);
  const [ruleCounts, setRuleCounts] = useState<Record<string, number>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>("browse");
  const [search, setSearch] = useState("");
  const [bankFilter, setBankFilter] = useState("All");
  const [toast, setToast] = useState("");

  // create-card form
  const [newBank, setNewBank] = useState("");
  const [newCardName, setNewCardName] = useState("");
  const [newNetwork, setNewNetwork] = useState(NETWORKS[0]);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // rules form
  const [rulesCard, setRulesCard] = useState<Card | null>(null);
  const [rulesText, setRulesText] = useState("");
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [rulesError, setRulesError] = useState("");
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSavedCount, setRulesSavedCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [cat, mine] = await Promise.all([
      apiFetch<Card[]>("/cards"),
      apiFetch<Card[]>("/users/me/cards"),
    ]);
    setCatalog(cat);
    setWallet(mine);
    const counts = await Promise.all(
      mine.map((c) => apiFetch<{ count: number }>(`/cards/${c.id}/rules/count`).catch(() => ({ count: -1 })))
    );
    setRuleCounts(Object.fromEntries(mine.map((c, i) => [c.id, counts[i].count])));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    apiFetch<UserInfo>("/auth/me").then(setUser).catch(() => {});
    load().catch(() => {});
  }, [router, load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  function openBrowse() {
    setMode("browse"); setSearch(""); setBankFilter("All"); setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setCreateError(""); setRulesError(""); setRulesSavedCount(null);
    setNewBank(""); setNewCardName(""); setNewNetwork(NETWORKS[0]);
    setRulesText(""); setRulesFile(null); setRulesCard(null);
  }

  async function addCard(c: Card) {
    setWallet((w) => (w ? [...w, c] : [c])); // optimistic
    try {
      await apiFetch(`/users/me/cards/${c.id}`, { method: "POST" });
      setRuleCounts((r) => ({ ...r, [c.id]: r[c.id] ?? 0 }));
      showToast(`${c.card_name} added to your wallet`);
    } catch {
      setWallet((w) => w?.filter((x) => x.id !== c.id) ?? null);
      showToast("Couldn't add that card — try again");
    }
  }

  async function removeCard(c: Card) {
    setWallet((w) => w?.filter((x) => x.id !== c.id) ?? null); // optimistic
    try {
      await apiFetch(`/users/me/cards/${c.id}`, { method: "DELETE" });
    } catch {
      setWallet((w) => (w ? [...w, c] : [c]));
    }
  }

  async function createCard() {
    if (!newBank.trim() || !newCardName.trim()) {
      setCreateError("Bank name and card name are both required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const card = await apiFetch<Card>("/cards", {
        method: "POST",
        body: JSON.stringify({ bank_name: newBank.trim(), card_name: newCardName.trim(), network: newNetwork }),
      });
      await apiFetch(`/users/me/cards/${card.id}`, { method: "POST" });
      setCatalog((c) => (c ? [...c, card] : [card]));
      setWallet((w) => (w ? [...w, card] : [card]));
      setRuleCounts((r) => ({ ...r, [card.id]: 0 }));
      setRulesCard(card);
      setMode("rules");
    } catch (e) {
      setCreateError(e instanceof Error && e.message.includes("409")
        ? "That card already exists in the catalog."
        : "Couldn't create the card — try again.");
    } finally {
      setCreating(false);
    }
  }

  function openRulesFor(c: Card) {
    setRulesCard(c); setRulesText(""); setRulesFile(null); setRulesError(""); setRulesSavedCount(null);
    setMode("rules"); setModalOpen(true);
  }

  async function saveRules() {
    if (!rulesCard) return;
    if (!rulesText.trim() && !rulesFile) {
      setRulesError("Paste the reward terms, or choose a file to upload.");
      return;
    }
    setRulesSaving(true);
    setRulesError("");
    try {
      const form = new FormData();
      if (rulesFile) form.append("file", rulesFile);
      else form.append("text", rulesText);
      const res = await apiFetchForm<{ chunks: number }>(`/cards/${rulesCard.id}/rules`, form);
      setRulesSavedCount(res.chunks);
      setRuleCounts((r) => ({ ...r, [rulesCard.id]: (r[rulesCard.id] ?? 0) + res.chunks }));
    } catch (e) {
      setRulesError(
        e instanceof Error && e.message.includes("400") && e.message.toLowerCase().includes("unstructured")
          ? "PDF/DOCX isn't supported yet on this server — paste the text instead, or upload a .md/.txt file."
          : "Couldn't save those rules — try again."
      );
    } finally {
      setRulesSaving(false);
    }
  }

  function finishRules() {
    showToast(
      rulesSavedCount !== null
        ? `${rulesCard?.card_name} is ready — rules saved`
        : `${rulesCard?.card_name} added — add rules anytime from My Cards`
    );
    closeModal();
  }

  const banks = useMemo(
    () => ["All", ...Array.from(new Set((catalog ?? []).map((c) => c.bank_name)))],
    [catalog]
  );

  const ownedIds = new Set((wallet ?? []).map((c) => c.id));
  const results = (catalog ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    return (
      (bankFilter === "All" || c.bank_name === bankFilter) &&
      (!q || `${c.card_name} ${c.bank_name}`.toLowerCase().includes(q))
    );
  });

  const loading = wallet === null;

  return (
    <div>
      <Nav email={user?.email} />
      <section className="container-wide">
        <div className="fade-up" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
          <div>
            <h2 className="page-title">My Cards</h2>
            <div className="page-sub">
              {loading ? "Loading your wallet…" : wallet.length ? `${wallet.length} card${wallet.length > 1 ? "s" : ""} in your wallet` : "No cards yet"}
            </div>
          </div>
          <button className="btn-primary" onClick={openBrowse}>＋ Add a card</button>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 18 }}>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 176, borderRadius: 16 }} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && wallet.length === 0 && (
          <div
            style={{
              border: "1px dashed var(--border-2)", borderRadius: "var(--r-xl)", padding: "60px 30px",
              textAlign: "center",
              background: "radial-gradient(500px 300px at 50% 0%, rgba(109,124,255,.06), transparent 70%)",
            }}
          >
            <div style={{ width: 90, height: 58, margin: "0 auto 22px", borderRadius: 12, background: "linear-gradient(135deg,var(--surface-3),var(--surface-2))", border: "1px solid var(--border-2)", position: "relative", boxShadow: "var(--shadow)" }}>
              <div style={{ position: "absolute", bottom: 12, left: 12, width: 26, height: 5, borderRadius: 3, background: "var(--faint)" }} />
              <div style={{ position: "absolute", top: 8, right: 12, fontSize: 18 }}>＋</div>
            </div>
            <div className="num" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-.01em" }}>Add your first card</div>
            <div style={{ fontSize: 14.5, color: "var(--muted)", maxWidth: 360, margin: "8px auto 24px", lineHeight: 1.5 }}>
              Tell us which cards you own — no numbers, no linking — and we&apos;ll start giving you personalized answers.
            </div>
            <button className="btn-white" style={{ fontSize: 14.5, padding: "12px 22px" }} onClick={openBrowse}>
              Browse the catalog
            </button>
          </div>
        )}

        {/* Wallet grid */}
        {!loading && wallet.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 18 }}>
            {wallet.map((c) => {
              const count = ruleCounts[c.id];
              const noRules = count === 0;
              return (
                <div key={c.id} style={{ animation: "pop .5s var(--ease-spring) both" }}>
                  <CardVisual bank={c.bank_name} card={c.card_name} network={c.network} seed={seedFromId(c.id)} />
                  {noRules && (
                    <div
                      style={{
                        marginTop: 10, display: "flex", alignItems: "center", gap: 8,
                        fontSize: 12, color: "var(--warn)", background: "rgba(255,193,69,.08)",
                        border: "1px solid rgba(255,193,69,.22)", borderRadius: "var(--r-sm)", padding: "7px 10px",
                      }}
                    >
                      <span style={{ flex: 1 }}>No reward rules yet — won&apos;t show up in answers</span>
                      <button
                        onClick={() => openRulesFor(c)}
                        style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}
                      >
                        Add rules
                      </button>
                    </div>
                  )}
                  <button
                    className="chip-btn"
                    style={{ marginTop: 10, width: "100%", borderRadius: "var(--r-sm)", padding: 9 }}
                    onClick={() => removeCard(c)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, zIndex: 60, background: "rgba(6,8,12,.66)",
            backdropFilter: "blur(6px)", display: "grid", placeItems: "start center",
            padding: "60px 20px", overflow: "auto", animation: "fadeIn .25s var(--ease) both",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 640, background: "var(--surface)",
              border: "1px solid var(--border-2)", borderRadius: "var(--r-xl)",
              boxShadow: "var(--shadow)", overflow: "hidden", animation: "pop .35s var(--ease-spring) both",
            }}
          >
            {/* ---- BROWSE ---- */}
            {mode === "browse" && (
              <>
                <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>Add a card</div>
                    <button onClick={closeModal} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer", fontSize: 15 }} aria-label="Close">✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 14px" }}>
                    <span style={{ color: "var(--faint)" }}>⌕</span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by bank or card name…"
                      style={{ flex: 1, background: "transparent", border: "none", color: "var(--text)", fontSize: 14.5 }}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
                    {banks.map((b) => (
                      <button
                        key={b}
                        onClick={() => setBankFilter(b)}
                        className="chip-btn"
                        style={bankFilter === b ? { borderColor: "var(--accent)", background: "rgba(109,124,255,.12)", color: "var(--accent)" } : undefined}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ maxHeight: "42vh", overflow: "auto", padding: 8 }}>
                  {results.map((c) => {
                    const owned = ownedIds.has(c.id);
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 13px", borderRadius: "var(--r-md)" }}>
                        <div style={{ width: 56, height: 36, borderRadius: 7, flex: "none", border: "1px solid var(--border)", background: cardBg(c.bank_name) }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.card_name}</div>
                          <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{c.bank_name} · {networkBadge(c.network)}</div>
                        </div>
                        <button
                          onClick={() => !owned && addCard(c)}
                          disabled={owned}
                          className="chip-btn"
                          style={owned ? { color: "var(--reward)", cursor: "default", background: "transparent" } : { fontWeight: 600 }}
                        >
                          {owned ? "✓ Owned" : "＋ I own this"}
                        </button>
                      </div>
                    );
                  })}
                  {results.length === 0 && (
                    <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--faint)", fontSize: 14 }}>
                      No cards match “{search}”.
                    </div>
                  )}
                </div>
                <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                  <button
                    onClick={() => { setMode("create"); setCreateError(""); }}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13.5, fontWeight: 500 }}
                  >
                    Can&apos;t find your card? Add a new one →
                  </button>
                </div>
              </>
            )}

            {/* ---- CREATE ---- */}
            {mode === "create" && (
              <>
                <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>Add a new card</div>
                    <button onClick={closeModal} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer", fontSize: 15 }} aria-label="Close">✕</button>
                  </div>
                </div>
                <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                  <label style={{ fontSize: 13, color: "var(--muted)" }}>
                    Bank name
                    <input
                      value={newBank}
                      onChange={(e) => setNewBank(e.target.value)}
                      placeholder="e.g. HDFC Bank"
                      style={{ marginTop: 6, width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "11px 14px", color: "var(--text)", fontSize: 14.5 }}
                      autoFocus
                    />
                  </label>
                  <label style={{ fontSize: 13, color: "var(--muted)" }}>
                    Card name
                    <input
                      value={newCardName}
                      onChange={(e) => setNewCardName(e.target.value)}
                      placeholder="e.g. Regalia Gold"
                      style={{ marginTop: 6, width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "11px 14px", color: "var(--text)", fontSize: 14.5 }}
                    />
                  </label>
                  <label style={{ fontSize: 13, color: "var(--muted)" }}>
                    Network
                    <select
                      value={newNetwork}
                      onChange={(e) => setNewNetwork(e.target.value)}
                      style={{ marginTop: 6, width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "11px 14px", color: "var(--text)", fontSize: 14.5 }}
                    >
                      {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  {createError && <div style={{ fontSize: 13, color: "var(--danger)" }}>{createError}</div>}
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button className="chip-btn" onClick={() => setMode("browse")}>← Back</button>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={createCard} disabled={creating}>
                      {creating ? <span className="spinner" /> : "Create & continue"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ---- RULES ---- */}
            {mode === "rules" && rulesCard && (
              <>
                <div style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>Add reward rules</div>
                      <div style={{ fontSize: 12.5, color: "var(--faint)", marginTop: 2 }}>{rulesCard.bank_name} · {rulesCard.card_name}</div>
                    </div>
                    <button onClick={closeModal} style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer", fontSize: 15 }} aria-label="Close">✕</button>
                  </div>
                </div>
                <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                  {rulesSavedCount === null ? (
                    <>
                      <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
                        Paste the card&apos;s reward terms (cashback %, categories, caps) from the bank&apos;s T&amp;C page, or upload a <code>.md</code>/<code>.txt</code> file. We chunk and embed it so the optimizer can find it later.
                      </div>
                      <textarea
                        value={rulesText}
                        onChange={(e) => { setRulesText(e.target.value); if (e.target.value) setRulesFile(null); }}
                        placeholder={"e.g. \"5% cashback on dining and restaurants, capped at ₹500/month. 1% on all other spends.\""}
                        rows={6}
                        style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "11px 14px", color: "var(--text)", fontSize: 14, resize: "vertical", fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                        <span style={{ fontSize: 12, color: "var(--faint)" }}>or</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                      </div>
                      <input
                        type="file"
                        accept=".md,.markdown,.txt,.pdf,.docx"
                        onChange={(e) => { const f = e.target.files?.[0] ?? null; setRulesFile(f); if (f) setRulesText(""); }}
                        style={{ fontSize: 13, color: "var(--muted)" }}
                      />
                      {rulesError && <div style={{ fontSize: 13, color: "var(--danger)" }}>{rulesError}</div>}
                      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                        <button className="chip-btn" onClick={finishRules}>Skip for now</button>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={saveRules} disabled={rulesSaving}>
                          {rulesSaving ? <span className="spinner" /> : "Save rules"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", padding: "10px 0" }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--reward)", color: "var(--bg)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: 20, fontWeight: 700 }}>✓</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{rulesSavedCount} rule chunk{rulesSavedCount === 1 ? "" : "s"} saved</div>
                      <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 20 }}>This card can now show up in your answers.</div>
                      <button className="btn-primary" onClick={finishRules}>Done</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
