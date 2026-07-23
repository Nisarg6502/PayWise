export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "cc_optimizer_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Pull FastAPI's `{"detail": "..."}` message out of an apiFetch/apiFetchForm error, if present. */
export function extractApiErrorDetail(e: unknown): string | null {
  if (!(e instanceof Error)) return null;
  const match = e.message.match(/^API \d+: ([\s\S]*)$/);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]);
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** For multipart/form-data requests (file upload) — no Content-Type so the browser sets the boundary. */
export async function apiFetchForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export interface StreamEvent {
  node: string;
  update: Record<string, unknown>;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Consume the SSE stream from GET /chat/stream with a Bearer token.
 * (EventSource can't send Authorization headers, so we parse SSE via fetch.)
 */
export async function streamChat(
  query: string,
  history: ChatTurn[],
  onEvent: (e: StreamEvent) => void
): Promise<void> {
  const token = getToken();
  const historyParam = encodeURIComponent(JSON.stringify(history));
  const res = await fetch(
    `${API_BASE}/chat/stream?query=${encodeURIComponent(query)}&history=${historyParam}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by a blank line (\n\n or \r\n\r\n)
    const messages = buffer.split(/\r?\n\r?\n/);
    buffer = messages.pop() ?? "";
    for (const message of messages) {
      let event = "message";
      let data = "";
      for (const line of message.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (event === "node" && data) onEvent(JSON.parse(data));
    }
  }
}
