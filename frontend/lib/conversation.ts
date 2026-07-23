/* Client-side multi-turn chat transcript (per-browser), sent as `history`
 * with each chat request so follow-ups carry context. Distinct from
 * history.ts, which is an append-only log of past recommendations powering
 * the Analytics screen, not a conversation transcript. */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const KEY = "cc_optimizer_conversation";
const MAX_TURNS = 6;

export function loadConversation(): ConversationTurn[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushConversationTurn(turn: ConversationTurn): void {
  const items = [...loadConversation(), turn].slice(-MAX_TURNS);
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function clearConversation(): void {
  localStorage.removeItem(KEY);
}
