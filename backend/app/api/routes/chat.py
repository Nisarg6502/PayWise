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
from app.models import User, UserCardMapping

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    query: str


def _initial_state(query: str, user: User, db: Session) -> AgentState:
    owned_card_ids = [
        str(card_id)
        for card_id in db.scalars(
            select(UserCardMapping.card_id).where(UserCardMapping.user_id == user.id)
        )
    ]
    return {
        "query": query,
        "user_id": str(user.id),
        "owned_card_ids": owned_card_ids,
        "extracted_merchant": "",
        "extracted_amount": 0.0,
        "retrieved_rules": [],
        "calculated_yields": {},
        "qualitative_offers": [],
        "final_recommendation": "",
    }


@router.post("")
def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    state = run_agent(_initial_state(body.query, current_user, db), user_id=str(current_user.id))
    return {
        "merchant": state["extracted_merchant"],
        "amount": state["extracted_amount"],
        "calculated_yields": state["calculated_yields"],
        "qualitative_offers": state.get("qualitative_offers", []),
        "recommendation": state["final_recommendation"],
    }


@router.get("/stream")
async def chat_stream(
    query: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    initial = _initial_state(query, current_user, db)

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
