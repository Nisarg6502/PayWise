"use client";

export default function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span
        style={{
          width: 20, height: 20, borderRadius: "50%", background: "var(--reward)",
          color: "var(--bg)", display: "grid", placeItems: "center",
          fontSize: 12, fontWeight: 700, flex: "none",
        }}
      >
        ✓
      </span>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{message}</span>
    </div>
  );
}
