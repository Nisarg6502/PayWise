"""Document ingestion: card T&C / rewards docs -> Qdrant.

Pipeline:
  1. unstructured.io partitions the source document (PDF, DOCX, HTML, MD)
     and we render the elements to Markdown.
  2. Chunk by Markdown headers (#, ##, ###) so each reward rule stays
     within one semantically coherent chunk.
  3. Embed each chunk with nomic-embed-text-v1.5 via Ollama.
  4. Upsert into Qdrant with payload {card_id, bank_name, card_name,
     section, source, text} for strict ownership filtering at query time.

Usage:
    python -m app.ingestion.ingest --file "docs/hdfc_infinia.pdf" \
        --card-id "<uuid>" --bank-name "HDFC" --card-name "Infinia"
"""

import argparse
import uuid
from pathlib import Path

from langchain_text_splitters import MarkdownHeaderTextSplitter
from qdrant_client.models import PointStruct

from app.core.config import settings
from app.services.embeddings import embed_texts
from app.services.qdrant import ensure_collection, get_qdrant

HEADERS_TO_SPLIT_ON = [("#", "h1"), ("##", "h2"), ("###", "h3")]

EMBED_BATCH_SIZE = 16


def document_to_markdown(file_path: Path) -> str:
    """Partition any supported document with unstructured and render Markdown."""
    # Markdown sources need no parsing — read them directly.
    if file_path.suffix.lower() in {".md", ".markdown"}:
        return file_path.read_text(encoding="utf-8")

    # Imported lazily: unstructured is a heavy dependency and only the
    # ingestion CLI needs it, not the API server.
    from unstructured.partition.auto import partition

    elements = partition(filename=str(file_path))

    lines: list[str] = []
    for el in elements:
        category = getattr(el, "category", "")
        text = (el.text or "").strip()
        if not text:
            continue
        if category == "Title":
            lines.append(f"## {text}")
        elif category == "ListItem":
            lines.append(f"- {text}")
        else:
            lines.append(text)
    return "\n\n".join(lines)


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


def ingest_text(
    markdown: str, card_id: str, bank_name: str, card_name: str, source_name: str = "pasted"
) -> int:
    """Chunk, embed, and upsert already-extracted Markdown/plain text. Returns chunk count."""
    chunks = chunk_markdown(markdown)
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
