import { cardBg, cardPattern, isVisa, networkBadge } from "@/lib/cardTheme";

interface Props {
  bank: string;
  card: string;
  network: string;
  seed?: number;
  size?: "full" | "compact" | "thumb";
}

/** Generated card artwork per the design system — gradient by bank, pattern by seed. */
export default function CardVisual({ bank, card, network, seed = 0, size = "full" }: Props) {
  const badge = networkBadge(network);
  const badgeStyle: React.CSSProperties = {
    fontFamily: "var(--ff-num)",
    fontWeight: 700,
    color: "#fff",
    fontStyle: isVisa(network) ? "italic" : undefined,
  };

  if (size === "thumb") {
    return (
      <div
        style={{
          width: 38, height: 38, borderRadius: 9, flex: "none",
          border: "1px solid var(--border)", background: cardBg(bank),
        }}
        aria-hidden
      />
    );
  }

  const compact = size === "compact";
  return (
    <div
      style={{
        position: "relative",
        width: compact ? 210 : "100%",
        height: compact ? 132 : 176,
        borderRadius: compact ? 14 : 16,
        padding: compact ? 16 : 18,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        border: "1px solid var(--border-2)",
        background: cardBg(bank),
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        flex: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: cardPattern(seed), opacity: 0.5, pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: compact ? 11 : 12, color: "rgba(255,255,255,.78)", fontWeight: 500, letterSpacing: ".02em" }}>
          {bank.toUpperCase()}
        </span>
        <span style={{ ...badgeStyle, fontSize: compact ? 13 : 14 }}>{badge}</span>
      </div>
      {!compact && (
        <div
          style={{
            position: "relative", width: 34, height: 25, borderRadius: 5,
            background: "linear-gradient(135deg,#e9d38a,#b8963f)",
            border: "1px solid rgba(0,0,0,.15)",
          }}
        />
      )}
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: compact ? 13 : 14, color: "#fff", fontWeight: 600 }}>{card}</div>
      </div>
    </div>
  );
}
