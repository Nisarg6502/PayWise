"""Document ingestion: card T&C / rewards docs -> Qdrant.

Pipeline:
  1. Extract plain text from the source document (PDF via pypdf, DOCX via
     python-docx, or read directly for Markdown/plain text).
  2. Chunk by Markdown headers (#, ##, ###) when present; otherwise fall
     back to paragraph-boundary chunking (most bank T&C PDFs/DOCX have no
     literal "#" markers once converted to plain text).
  3. Embed each chunk with nomic-embed-text-v1.5 via Ollama.
  4. Upsert into Qdrant with payload {card_id, bank_name, card_name,
     section, source, text} for strict ownership filtering at query time.

Usage:
    python -m app.ingestion.ingest --file "docs/hdfc_infinia.pdf" \
        --card-id "<uuid>" --bank-name "HDFC" --card-name "Infinia"
"""

import argparse
import re
import uuid
from pathlib import Path

from langchain_text_splitters import MarkdownHeaderTextSplitter
from qdrant_client.models import PointStruct

from app.core.config import settings
from app.services.embeddings import embed_texts
from app.services.qdrant import ensure_collection, get_qdrant

HEADERS_TO_SPLIT_ON = [("#", "h1"), ("##", "h2"), ("###", "h3")]

EMBED_BATCH_SIZE = 16

# Below this size, a single paragraph-chunking fallback chunk is still fine
# for embedding quality — no need to split further.
PARAGRAPH_FALLBACK_THRESHOLD = 1500


def pdf_to_text(raw: bytes) -> str:
    """Extract plain text from a PDF (text-based, not scanned/OCR)."""
    import io

    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n\n".join(p for p in pages if p)


def docx_to_text(raw: bytes) -> str:
    """Extract plain text from a DOCX (paragraphs only, no tables/images)."""
    import io

    from docx import Document

    doc = Document(io.BytesIO(raw))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n\n".join(paragraphs)


def document_to_markdown(file_path: Path) -> str:
    """Read a document from disk as plain text, dispatching on extension."""
    suffix = file_path.suffix.lower()
    if suffix in {".md", ".markdown", ".txt"}:
        return file_path.read_text(encoding="utf-8")
    if suffix == ".pdf":
        return pdf_to_text(file_path.read_bytes())
    if suffix == ".docx":
        return docx_to_text(file_path.read_bytes())
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_markdown(markdown: str) -> list[dict]:
    """Split on Markdown headers; each chunk keeps its header trail as metadata."""
    splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=HEADERS_TO_SPLIT_ON, strip_headers=False
    )
    chunks = []
    for doc in splitter.split_text(markdown):
        section = " > ".join(
            doc.metadata.get(level) for _, level in HEADERS_TO_SPLIT_ON if doc.metadata.get(level)
        )
        chunks.append({"text": doc.page_content, "section": section})
    return chunks


def chunk_text(markdown: str) -> list[dict]:
    """Chunk by Markdown headers if present; otherwise fall back to paragraphs.

    PDF/DOCX extraction produces plain text with no "#" markers, so
    MarkdownHeaderTextSplitter just returns the whole document as one
    chunk — too large and unfocused for retrieval. Paragraph-boundary
    chunking keeps each reward-rule section separate in that case.
    """
    chunks = chunk_markdown(markdown)
    if len(chunks) <= 1 and len(markdown) > PARAGRAPH_FALLBACK_THRESHOLD:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", markdown) if p.strip()]
        chunks = [{"text": p, "section": f"Paragraph {i + 1}"} for i, p in enumerate(paragraphs)]
    return chunks


def ingest_text(
    markdown: str, card_id: str, bank_name: str, card_name: str, source_name: str = "pasted"
) -> int:
    """Chunk, embed, and upsert already-extracted Markdown/plain text. Returns chunk count."""
    chunks = chunk_text(markdown)
    if not chunks:
        raise ValueError("No chunks produced from the supplied text")

    ensure_collection()
    client = get_qdrant()

    total = 0
    for start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[start : start + EMBED_BATCH_SIZE]
        vectors = embed_texts([c["text"] for c in batch])
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "card_id": card_id,
                    "bank_name": bank_name,
                    "card_name": card_name,
                    "section": chunk["section"],
                    "source": source_name,
                    "text": chunk["text"],
                },
            )
            for chunk, vector in zip(batch, vectors)
        ]
        client.upsert(collection_name=settings.qdrant_collection, points=points)
        total += len(points)

    return total


def ingest_document(
    file_path: Path, card_id: str, bank_name: str, card_name: str
) -> int:
    """Run the full pipeline for one document on disk. Returns number of chunks stored."""
    markdown = document_to_markdown(file_path)
    return ingest_text(markdown, card_id, bank_name, card_name, source_name=file_path.name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest a card rewards document into Qdrant")
    parser.add_argument("--file", required=True, type=Path, help="Path to the document")
    parser.add_argument("--card-id", required=True, help="CreditCard UUID from PostgreSQL")
    parser.add_argument("--bank-name", required=True)
    parser.add_argument("--card-name", required=True)
    args = parser.parse_args()

    if not args.file.exists():
        raise SystemExit(f"File not found: {args.file}")

    count = ingest_document(args.file, args.card_id, args.bank_name, args.card_name)
    print(f"Ingested {count} chunks from {args.file.name} for card {args.card_name}")


if __name__ == "__main__":
    main()
