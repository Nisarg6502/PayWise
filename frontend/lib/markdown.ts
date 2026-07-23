/* Tiny dependency-free markdown-to-HTML for LLM recommendation text.
   Supports: **bold**, *italic*, `code`, > blockquotes, paragraphs, - lists,
   and inline citation markers [n] (1-indexed into the caller's citations
   list) rendered as clickable badges. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string, citationCount: number): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Accepts both the requested [n] form and the 【n】 full-width form some
    // models fall back to regardless of instruction (same reason
    // node_classify_and_extract parses its JSON forgivingly rather than
    // trusting the model to always comply exactly).
    .replace(/\[(\d+)\]|【(\d+)】/g, (match, a, b) => {
      const n = parseInt(a ?? b, 10);
      // Out-of-range markers (bad LLM output) are left as plain text rather
      // than producing a badge with nothing behind it.
      if (n < 1 || n > citationCount) return match;
      return `<button type="button" class="cite-badge" data-cite="${n - 1}">${n}</button>`;
    });
}

export function renderMarkdown(md: string, citationCount = 0): string {
  const blocks = md.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => l.trim().startsWith(">"))) {
        const inner = lines
          .map((l) => inline(escapeHtml(l.replace(/^\s*>\s?/, "")), citationCount))
          .join("<br/>");
        return `<blockquote>${inner}</blockquote>`;
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${inline(escapeHtml(l.replace(/^\s*[-*]\s+/, "")), citationCount)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.map((l) => inline(escapeHtml(l), citationCount)).join("<br/>")}</p>`;
    })
    .join("");
}
