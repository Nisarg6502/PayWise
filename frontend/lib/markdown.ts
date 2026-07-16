/* Tiny dependency-free markdown-to-HTML for LLM recommendation text.
   Supports: **bold**, *italic*, `code`, > blockquotes, paragraphs, - lists. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export function renderMarkdown(md: string): string {
  const blocks = md.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => l.trim().startsWith(">"))) {
        const inner = lines.map((l) => inline(escapeHtml(l.replace(/^\s*>\s?/, "")))).join("<br/>");
        return `<blockquote>${inner}</blockquote>`;
      }
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${inline(escapeHtml(l.replace(/^\s*[-*]\s+/, "")))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.map((l) => inline(escapeHtml(l))).join("<br/>")}</p>`;
    })
    .join("");
}
