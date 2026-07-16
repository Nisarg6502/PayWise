"""Seed the database with a dev user and sample cards, and print a JWT.

Dev convenience only — lets you exercise the authenticated API without
completing the Google OAuth flow.

Usage (SQLite, no Docker needed):
    set DATABASE_URL=sqlite:///./dev.db && python -m app.db.seed
Or against PostgreSQL (docker compose up -d) just:
    python -m app.db.seed
"""

from sqlalchemy import select

import app.models  # noqa: F401 — register tables
from app.auth.jwt import create_access_token
from app.db.session import Base, SessionLocal, engine
from app.models import CreditCard, User, UserCardMapping

DEV_EMAIL = "dev@example.com"

SAMPLE_CARDS = [
    ("HDFC", "Infinia", "Visa"),
    ("HDFC", "Swiggy Card", "Mastercard"),
    ("Axis", "Ace", "Visa"),
    ("SBI", "Cashback", "Visa"),
    ("ICICI", "Amazon Pay", "Visa"),
]


def seed() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == DEV_EMAIL))
        if user is None:
            user = User(email=DEV_EMAIL, name="Dev User")
            db.add(user)
            db.flush()

        for bank, name, network in SAMPLE_CARDS:
            card = db.scalar(
                select(CreditCard).where(
                    CreditCard.bank_name == bank, CreditCard.card_name == name
                )
            )
            if card is None:
                card = CreditCard(bank_name=bank, card_name=name, network=network)
                db.add(card)
                db.flush()
            if db.get(UserCardMapping, (user.id, card.id)) is None:
                db.add(UserCardMapping(user_id=user.id, card_id=card.id))

        db.commit()

        token = create_access_token(user_id=str(user.id), email=user.email)
        print(f"Seeded user {user.email} ({user.id}) with {len(SAMPLE_CARDS)} cards.")
        print("\nDev JWT (Authorization: Bearer ...):\n")
        print(token)


if __name__ == "__main__":
    seed()
