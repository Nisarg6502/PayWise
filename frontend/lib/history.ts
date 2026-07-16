/* Local query history (per-browser) powering the Analytics screen. */

export interface HistoryEntry {
  q: string;
  winner: string;
  bank: string;
  amount: number | null;
  rate: number; // fraction, e.g. 0.1
  at: string; // ISO timestamp
}

const KEY = "cc_optimizer_history";
const MAX = 30;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): void {
  const items = [entry, ...loadHistory()].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return "Yesterday";
  return `${Math.floor(s / 86400)} days ago`;
}
