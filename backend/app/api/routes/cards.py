"""Card catalog, user card ownership, and reward-rule ingestion endpoints."""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from qdrant_client.models import FieldCondition, Filter, MatchValue
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.ingestion.ingest import docx_to_text, ingest_text, pdf_to_text
from app.models import CreditCard, User, UserCardMapping
from app.services.qdrant import get_qdrant

router = APIRouter(tags=["cards"])

TEXT_EXTENSIONS = {".md", ".markdown", ".txt"}


class CardCreate(BaseModel):
    bank_name: str
    card_name: str
    network: str


def _card_dict(card: CreditCard) -> dict:
    return {
        "id": str(card.id),
        "bank_name": card.bank_name,
        "card_name": card.card_name,
        "network": card.network,
    }


@router.get("/cards")
def list_catalog(db: Session = Depends(get_db)) -> list[dict]:
    """Global card catalog."""
    return [_card_dict(c) for c in db.scalars(select(CreditCard).order_by(CreditCard.bank_name))]


@router.post("/cards", status_code=status.HTTP_201_CREATED)
def create_card(
    body: CardCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Add a card product to the global catalog."""
    existing = db.scalar(
        select(CreditCard).where(
            CreditCard.bank_name == body.bank_name, CreditCard.card_name == body.card_name
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Card already exists in catalog")
    card = CreditCard(bank_name=body.bank_name, card_name=body.card_name, network=body.network)
    db.add(card)
    db.commit()
    db.refresh(card)
    return _card_dict(card)


@router.get("/users/me/cards")
def my_cards(
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    return [_card_dict(c) for c in current_user.cards]


@router.post("/users/me/cards/{card_id}", status_code=status.HTTP_201_CREATED)
def add_my_card(
    card_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    card = db.get(CreditCard, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    mapping = db.get(UserCardMapping, (current_user.id, card_id))
    if mapping is None:
        db.add(UserCardMapping(user_id=current_user.id, card_id=card_id))
        db.commit()
    return _card_dict(card)


@router.delete("/users/me/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_card(
    card_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    mapping = db.get(UserCardMapping, (current_user.id, card_id))
    if mapping is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You don't own this card")
    db.delete(mapping)
    db.commit()


@router.get("/cards/{card_id}/rules/count")
def count_rules(card_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """How many reward-rule chunks this card has in Qdrant (0 = optimizer can't recommend it yet)."""
    if db.get(CreditCard, card_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    result = get_qdrant().count(
        collection_name=settings.qdrant_collection,
        count_filter=Filter(must=[FieldCondition(key="card_id", match=MatchValue(value=str(card_id)))]),
    )
    return {"count": result.count}


@router.post("/cards/{card_id}/rules", status_code=status.HTTP_201_CREATED)
async def add_rules(
    card_id: uuid.UUID,
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Ingest reward-rule text (pasted or uploaded) for a card into Qdrant.

    Accepts plain text/Markdown, PDF, or DOCX uploads. PDF extraction is
    text-based (via pypdf) — scanned/image-only PDFs won't extract any text.
    """
    card = db.get(CreditCard, card_id)
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")

    if file is not None:
        suffix = ("." + file.filename.rsplit(".", 1)[-1].lower()) if file.filename and "." in file.filename else ""
        raw = await file.read()
        if suffix in TEXT_EXTENSIONS or suffix == "":
            content = raw.decode("utf-8", errors="ignore")
        elif suffix == ".pdf":
            content = pdf_to_text(raw)
            if not content.strip():
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    "Couldn't extract any text from this PDF — it may be a scanned/image-only "
                    "document. Paste the text instead.",
                )
        elif suffix == ".docx":
            content = docx_to_text(raw)
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported file type '{suffix}'. Upload .pdf, .docx, .md, or .txt, or paste the text instead.",
            )
        source_name = file.filename or "uploaded file"
    elif text and text.strip():
        content = text
        source_name = "pasted"
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provide either 'text' or a 'file'")

    try:
        count = ingest_text(content, str(card_id), card.bank_name, card.card_name, source_name=source_name)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    return {"chunks": count}
