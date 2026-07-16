"""Golden-dataset eval for the LangGraph pipeline.

Runs each case in golden_dataset.json through the real graph (against the dev
seed user's 5 owned cards, live Qdrant + Jina + LLM), then scores three
independent things per case so a failure points at the actual broken stage:

  - intent:     did extract_intent parse the right merchant keyword + amount?
  - retrieval:  is the expected card among the top-3 reranked chunks?
  - math:       given whatever the graph actually retrieved, is the expected
                card's card the one with the highest computed yield?

Usage:
    cd backend
    .venv/Scripts/python.exe -m evals.run_eval
"""

import json
from pathlib import Path

from sqlalchemy import select

import app.models  # noqa: F401 — register tables
from app.agent.graph import run_agent
from app.db.session import SessionLocal
from app.models import User, UserCardMapping

DATASET_PATH = Path(__file__).parent / "golden_dataset.json"
DEV_EMAIL = "dev@example.com"


def _dev_user_and_cards():
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == DEV_EMAIL))
        if user is None:
            raise RuntimeError("Dev user not found — run `python -m app.db.seed` first.")
        owned_card_ids = [
            str(cid)
            for cid in db.scalars(
                select(UserCardMapping.card_id).where(UserCardMapping.user_id == user.id)
            )
        ]
        return str(user.id), owned_card_ids


def run() -> None:
    cases = json.loads(DATASET_PATH.read_text())
    user_id, owned_card_ids = _dev_user_and_cards()

    results = []
    for case in cases:
        state = {
            "query": case["query"],
            "user_id": user_id,
            "owned_card_ids": owned_card_ids,
            "extracted_merchant": "",
            "extracted_amount": 0.0,
            "retrieved_rules": [],
            "calculated_yields": {},
            "final_recommendation": "",
        }
        final = run_agent(state, user_id=f"eval::{case['id']}")

        intent_ok = (
            case["expected_merchant_keyword"] in final["extracted_merchant"].lower()
            and abs(final["extracted_amount"] - case["expected_amount"]) < 1
        )

        retrieved_card_names = {
            f"{r['bank_name']} {r['card_name']}".strip() for r in final["retrieved_rules"]
        }
        retrieval_ok = case["expected_card"] in retrieved_card_names

        yields = final["calculated_yields"]
        winner = max(yields.items(), key=lambda kv: kv[1]["rate"], default=(None, None))[0]
        math_ok = winner == case["expected_card"]
        winner_rate = yields.get(case["expected_card"], {}).get("rate")
        rate_ok = winner_rate is not None and abs(winner_rate - case["expected_rate"]) < 1e-6

        results.append(
            {
                "id": case["id"],
                "intent_ok": intent_ok,
                "retrieval_ok": retrieval_ok,
                "math_ok": math_ok and rate_ok,
                "winner": winner,
                "expected": case["expected_card"],
                "note": case.get("note", ""),
            }
        )

    _report(results)


def _report(results: list[dict]) -> None:
    print(f"{'CASE':<22} {'INTENT':<8} {'RETRIEVAL':<11} {'MATH':<6} WINNER (expected)")
    print("-" * 90)
    for r in results:
        flag = lambda ok: "PASS" if ok else "FAIL"
        print(
            f"{r['id']:<22} {flag(r['intent_ok']):<8} {flag(r['retrieval_ok']):<11} "
            f"{flag(r['math_ok']):<6} {r['winner']!r} (expected {r['expected']!r})"
        )
        if not r["math_ok"] and r["note"]:
            print(f"   note: {r['note']}")

    n = len(results)
    for key, label in [("intent_ok", "Intent extraction"), ("retrieval_ok", "Retrieval"), ("math_ok", "Math/winner")]:
        passed = sum(1 for r in results if r[key])
        print(f"\n{label}: {passed}/{n} passed ({passed / n:.0%})")


if __name__ == "__main__":
    run()
