"""Global credit-card catalog and user ownership mapping."""

import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class CreditCard(Base):
    """Global card catalog — one row per card product (not per user)."""

    __tablename__ = "credit_cards"
    __table_args__ = (UniqueConstraint("bank_name", "card_name", name="uq_bank_card"),)

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    card_name: Mapped[str] = mapped_column(String(255), nullable=False)
    network: Mapped[str] = mapped_column(String(50), nullable=False)  # Visa / Mastercard / RuPay / Amex

    owners = relationship(
        "User",
        secondary="user_card_mappings",
        back_populates="cards",
        lazy="selectin",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<CreditCard {self.bank_name} {self.card_name}>"


class UserCardMapping(Base):
    """Association table: which users own which cards."""

    __tablename__ = "user_card_mappings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("credit_cards.id", ondelete="CASCADE"),
        primary_key=True,
    )
