"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cards", label: "My Cards" },
  { href: "/analytics", label: "Analytics" },
];

export default function Nav({ email }: { email?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="nav">
      <Link href="/dashboard" className="brand" style={{ color: "var(--text)" }}>
        <div className="brand-mark"><div /></div>
        <span className="brand-name">
          PayWise<span style={{ color: "var(--accent)" }}>.</span>
        </span>
      </Link>
      <div className="nav-tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`nav-tab ${pathname === t.href ? "active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {email && (
        <span style={{ fontSize: 12.5, color: "var(--faint)", whiteSpace: "nowrap" }} className="nav-email">
          {email}
        </span>
      )}
      <button
        className="chip-btn"
        onClick={() => {
          clearToken();
          router.replace("/");
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
