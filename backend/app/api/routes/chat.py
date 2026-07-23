"""Recommendation endpoint — runs the LangGraph agent.

POST /chat        -> full result as JSON
GET  /chat/stream -> Server-Sent Events; one event per completed graph node,
                     ending with the final recommendation.
"""

import json

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.agent.graph import AgentState, run_agent, stream_agent
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models import CreditCard, User, UserCardMapping

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_HISTORY_TURNS = 6


class ChatTurnIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    query: str
    history: list[ChatTurnIn] = []


def _initial_state(query: str, history: list[dict], user: User, db: Session) -> AgentState:
    owned_rows = db.execute(
        select(CreditCard.id, CreditCard.bank_name, CreditCard.card_name)
        .join(UserCardMapping, UserCardMapping.card_id == CreditCard.id)
        .where(UserCardMapping.user_id == user.id)
    ).all()
    owned_card_ids = [str(r.id) for r in owned_rows]
    owned_cards = [{"id": str(r.id), "bank_name": r.bank_name, "card_name": r.card_name} for r in owned_rows]

    return {
        "query": query,
        "user_id": str(user.id),
        "owned_card_ids": owned_card_ids,
        "owned_cards": owned_cards,
        "history": [{"role": h["role"], "content": h["content"]} for h in history][-MAX_HISTORY_TURNS:],
        "query_type": "",
        "named_card_hint": "",
        "extracted_merchant": "",
        "extracted_amount": 0.0,
        "retrieved_rules": [],
        "calculated_yields": {},
        "qualitative_offers": [],
        "citations": [],
        "final_recommendation": "",
        "follow_up_questions": [],
    }


@router.post("")
def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    history = [{"role": h.role, "content": h.content} for h in body.history]
    state = run_agent(_initial_state(body.query, history, current_user, db), user_id=str(current_user.id))
    return {
        "query_type": state["query_type"],
        "merchant": state["extracted_merchant"],
        "amount": state["extracted_amount"],
        "calculated_yields": state["calculated_yields"],
        "qualitative_offers": state.get("qualitative_offers", []),
        "citations": state.get("citations", []),
        "recommendation": state["final_recommendation"],
        "follow_up_questions": state.get("follow_up_questions", []),
    }


@router.get("/stream")
async def chat_stream(
    query: str = Query(..., min_length=1),
    history: str = Query("[]"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        history_turns = json.loads(history)
        if not isinstance(history_turns, list):
            history_turns = []
    except json.JSONDecodeError:
        history_turns = []

    initial = _initial_state(query, history_turns, current_user, db)

    def event_generator():
        # stream_mode="updates" yields {node_name: state_delta} per node
        for update in stream_agent(initial, user_id=str(current_user.id)):
            for node_name, delta in update.items():
                yield {
                    "event": "node",
                    "data": json.dumps({"node": node_name, "update": delta}, default=str),
                }
        yield {"event": "done", "data": ""}

    return EventSourceResponse(event_generator())
