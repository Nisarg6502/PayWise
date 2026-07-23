"""Golden-dataset eval for the LangGraph pipeline.

Runs each case in golden_dataset.json through the real graph (against the dev
seed user's 5 owned cards, live Qdrant + Jina + LLM). Scoring branches by
`expected_query_type`:

  - purchase cases: intent (merchant/amount extraction), retrieval (expected
    card among the reranked chunks), and math (expected card has the highest
    computed yield) — same as before, plus a classification check.
  - general/off_topic cases: classification (did it route correctly) and,
    for general, a grounding check (every citation's card_id belongs to the
    user's owned cards) instead of a rate/winner check.

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
from app.models import CreditCard, User, UserCardMapping

DATASET_PATH = Path(__file__).parent / "golden_dataset.json"
DEV_EMAIL = "dev@example.com"


def _dev_user_and_cards():
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == DEV_EMAIL))
        if user is None:
            raise RuntimeError("Dev user not found — run `python -m app.db.seed` first.")
        owned_rows = db.execute(
            select(CreditCard.id, CreditCard.bank_name, CreditCard.card_name)
            .join(UserCardMapping, UserCardMapping.card_id == CreditCard.id)
            .where(UserCardMapping.user_id == user.id)
        ).all()
        owned_card_ids = [str(r.id) for r in owned_rows]
        owned_cards = [{"id": str(r.id), "bank_name": r.bank_name, "card_name": r.card_name} for r in owned_rows]
        return str(user.id), owned_card_ids, owned_cards


def run() -> None:
    cases = json.loads(DATASET_PATH.read_text())
    user_id, owned_card_ids, owned_cards = _dev_user_and_cards()

    results = []
    for case in cases:
        state = {
            "query": case["query"],
            "user_id": user_id,
            "owned_card_ids": owned_card_ids,
            "owned_cards": owned_cards,
            "history": [],
            "query_type": "",
            "named_card_hint": "",
            "extracted_merchant": "",
            "extracted_amount": 0.0,
            "retrieved_rules": [],
            "calculated_yields": {},
            "qualitative_offers": [],
            "citations": [],
            "final_recommendation": "",
        }
        final = run_agent(state, user_id=f"eval::{case['id']}")

        expected_type = case["expected_query_type"]
        classification_ok = final["query_type"] == expected_type

        result = {
            "id": case["id"],
            "expected_query_type": expected_type,
            "classification_ok": classification_ok,
            "note": case.get("note", ""),
        }

        if expected_type == "purchase":
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

            result.update(
                {
                    "intent_ok": intent_ok,
                    "retrieval_ok": retrieval_ok,
                    "math_ok": math_ok and rate_ok,
                    "winner": winner,
                    "expected": case["expected_card"],
                }
            )
        elif expected_type == "general":
            citations = final.get("citations", [])
            citation_ok = bool(citations) and all(c["card_id"] in owned_card_ids for c in citations)
            result["citation_ok"] = citation_ok
        else:  # off_topic
            decline_ok = "only help with" in final["final_recommendation"].lower()
            result["decline_ok"] = decline_ok

        results.append(result)

    _report(results)


def _report(results: list[dict]) -> None:
    flag = lambda ok: "PASS" if ok else "FAIL"

    purchase = [r for r in results if r["expected_query_type"] == "purchase"]
    general = [r for r in results if r["expected_query_type"] == "general"]
    off_topic = [r for r in results if r["expected_query_type"] == "off_topic"]

    if purchase:
        print(f"{'CASE':<22} {'CLASS':<6} {'INTENT':<8} {'RETRIEVAL':<11} {'MATH':<6} WINNER (expected)")
        print("-" * 96)
        for r in purchase:
            print(
                f"{r['id']:<22} {flag(r['classification_ok']):<6} {flag(r['intent_ok']):<8} "
                f"{flag(r['retrieval_ok']):<11} {flag(r['math_ok']):<6} "
                f"{r['winner']!r} (expected {r['expected']!r})"
            )
            if not r["math_ok"] and r["note"]:
                print(f"   note: {r['note']}")

    if general or off_topic:
        print(f"\n{'CASE':<22} {'CLASS':<6} {'GROUNDING/DECLINE'}")
        print("-" * 60)
        for r in general:
            print(f"{r['id']:<22} {flag(r['classification_ok']):<6} {flag(r['citation_ok'])}")
        for r in off_topic:
            print(f"{r['id']:<22} {flag(r['classification_ok']):<6} {flag(r['decline_ok'])}")

    n = len(results)
    passed_class = sum(1 for r in results if r["classification_ok"])
    print(f"\nClassification (all cases): {passed_class}/{n} passed ({passed_class / n:.0%})")

    for key, label, subset in [
        ("intent_ok", "Intent extraction", purchase),
        ("retrieval_ok", "Retrieval", purchase),
        ("math_ok", "Math/winner", purchase),
        ("citation_ok", "General grounding", general),
        ("decline_ok", "Off-topic decline", off_topic),
    ]:
        if not subset:
            continue
        passed = sum(1 for r in subset if r[key])
        print(f"{label}: {passed}/{len(subset)} passed ({passed / len(subset):.0%})")


if __name__ == "__main__":
    run()
