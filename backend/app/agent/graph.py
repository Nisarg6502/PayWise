"""LangGraph orchestration for the credit-card optimizer.

Sequential flow:
    extract_intent -> retrieve_rules -> rerank -> calculate_math -> generate_response

Every node is a pure function over AgentState; the only non-deterministic
steps are the two LLM calls (intent extraction and final generation).
The reward math itself is deterministic Python.
"""

import json
import re
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.core.config import settings
from app.services.embeddings import embed_query
from app.services.ollama_client import chat
from app.services.qdrant import get_qdrant, owned_cards_filter
from app.services.reranker import rerank

from langfuse.decorators import langfuse_context, observe

# Explicit config (rather than relying on ambient LANGFUSE_* env vars) so this
# works the same whether keys come from a local .env or Cloud Run secrets.
# `enabled=False` when keys are missing makes @observe a no-op — safe for local
# dev without a Langfuse account.
langfuse_context.configure(
    public_key=settings.langfuse_public_key,
    secret_key=settings.langfuse_secret_key,
    host=settings.langfuse_host,
    enabled=bool(settings.langfuse_secret_key and settings.langfuse_public_key),
)

RETRIEVAL_LIMIT = 10  # dense candidates fetched before reranking
RERANK_TOP_K = 3


class AgentState(TypedDict):
    query: str
    user_id: str
    owned_card_ids: list[str]
    extracted_merchant: str
    extracted_amount: float
    retrieved_rules: list[dict]
    calculated_yields: dict
    qualitative_offers: list[dict]
    final_recommendation: str


# --------------------------------------------------------------------------
# Nodes
# --------------------------------------------------------------------------

INTENT_SYSTEM_PROMPT = """You extract purchase intent from a user's question about credit cards.
Respond with ONLY a JSON object, no prose, in this exact shape:
{"merchant": "<merchant or spend category, lowercase>", "amount": <number, 0 if not stated>}"""


@observe(name="extract_intent")
def node_extract_intent(state: AgentState) -> dict:
    """Call Qwen3 to extract the merchant and the spend amount from the query."""
    raw = chat(system=INTENT_SYSTEM_PROMPT, user=state["query"])

    merchant, amount = "", 0.0
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            merchant = str(parsed.get("merchant", "")).strip().lower()
            amount = float(parsed.get("amount") or 0)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    return {"extracted_merchant": merchant, "extracted_amount": amount}


@observe(name="retrieve_rules")
def node_retrieve_rules(state: AgentState) -> dict:
    """Dense retrieval from Qdrant, strictly filtered to the user's owned cards."""
    if not state["owned_card_ids"]:
        return {"retrieved_rules": []}

    search_text = f"{state['extracted_merchant']} rewards: {state['query']}"
    vector = embed_query(search_text)

    hits = get_qdrant().query_points(
        collection_name=settings.qdrant_collection,
        query=vector,
        query_filter=owned_cards_filter(state["owned_card_ids"]),
        limit=RETRIEVAL_LIMIT,
        with_payload=True,
    ).points

    rules = [
        {
            "card_id": hit.payload["card_id"],
            "card_name": hit.payload.get("card_name", ""),
            "bank_name": hit.payload.get("bank_name", ""),
            "section": hit.payload.get("section", ""),
            "text": hit.payload["text"],
            "dense_score": hit.score,
        }
        for hit in hits
    ]
    return {"retrieved_rules": rules}


@observe(name="rerank")
def node_rerank(state: AgentState) -> dict:
    """Rerank retrieved chunks with bge-reranker-v2-m3; keep the top 3."""
    top_chunks = rerank(state["query"], state["retrieved_rules"], top_k=RERANK_TOP_K)
    return {"retrieved_rules": top_chunks}


# Deterministic parsing of reward rates out of rule text.
# Matches patterns like "5% cashback", "3.3% reward rate", "10x points".
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_MULTIPLIER_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[xX]\s*(?:points|rewards)?")
_BASE_POINT_VALUE = 0.01  # assumed value per point-multiple; tune per program


@observe(name="calculate_math")
def node_calculate_math(state: AgentState) -> dict:
    """Pure deterministic reward calculation — no LLM involvement.

    For each reranked rule, extract the best advertised rate and compute
    the yield on the extracted amount. Rules that carry no computable
    percentage/points rate (e.g. flat "Buy One Get One" or Rs-off deals,
    common in T&C docs) are NOT discarded — they're passed through as
    qualitative offers so generate_response can still describe them from
    the actual rule text instead of falsely reporting no match at all.
    """
    amount = state["extracted_amount"]
    yields: dict[str, dict] = {}
    qualitative: list[dict] = []

    for rule in state["retrieved_rules"]:
        rates = [float(p) / 100 for p in _PERCENT_RE.findall(rule["text"])]
        rates += [float(m) * _BASE_POINT_VALUE for m in _MULTIPLIER_RE.findall(rule["text"])]
        # Ignore implausible values (e.g. "36% APR", fee percentages > 25%)
        plausible = [r for r in rates if 0 < r <= 0.25]
        card_key = f"{rule['bank_name']} {rule['card_name']}".strip() or rule["card_id"]

        if not plausible:
            qualitative.append(
                {
                    "card_id": rule["card_id"],
                    "card_name": card_key,
                    "rule_section": rule["section"],
                    "rule_text": rule["text"][:500],
                }
            )
            continue

        best_rate = max(plausible)
        candidate = {
            "card_id": rule["card_id"],
            "rate": best_rate,
            "estimated_reward": round(best_rate * amount, 2) if amount else None,
            "rule_section": rule["section"],
            "rule_text": rule["text"][:500],
        }
        # Keep the best rule per card
        if card_key not in yields or candidate["rate"] > yields[card_key]["rate"]:
            yields[card_key] = candidate

    return {"calculated_yields": yields, "qualitative_offers": qualitative}


GENERATION_SYSTEM_PROMPT = """You are a credit-card rewards advisor. Using ONLY the
pre-calculated yields, qualitative offers, and rule excerpts provided, recommend which
owned card the user should use for this purchase.

- If `calculated_yields` has entries, state the winning card, the expected reward, and
  a short justification quoting the relevant rule.
- If `calculated_yields` is empty but `qualitative_offers` has entries, describe the
  relevant offer(s) (e.g. flat discounts, Buy-One-Get-One deals, milestone benefits)
  straight from the rule text — these are real benefits that just don't reduce to a
  clean percentage rate, do not invent a rate or numeric reward for them.
- Only say you could not find an applicable reward rule if BOTH are empty.
- Never invent numbers that are not present in the data."""


@observe(name="generate_response")
def node_generate_response(state: AgentState) -> dict:
    """Call Qwen3 to turn the deterministic math into human-readable advice."""
    context = json.dumps(
        {
            "query": state["query"],
            "merchant": state["extracted_merchant"],
            "amount": state["extracted_amount"],
            "calculated_yields": state["calculated_yields"],
            "qualitative_offers": state.get("qualitative_offers", []),
        },
        indent=2,
    )
    answer = chat(system=GENERATION_SYSTEM_PROMPT, user=context, temperature=0.3)
    return {"final_recommendation": answer}


# --------------------------------------------------------------------------
# Graph assembly — strictly sequential edges
# --------------------------------------------------------------------------

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("extract_intent", node_extract_intent)
    graph.add_node("retrieve_rules", node_retrieve_rules)
    graph.add_node("rerank", node_rerank)
    graph.add_node("calculate_math", node_calculate_math)
    graph.add_node("generate_response", node_generate_response)

    graph.add_edge(START, "extract_intent")
    graph.add_edge("extract_intent", "retrieve_rules")
    graph.add_edge("retrieve_rules", "rerank")
    graph.add_edge("rerank", "calculate_math")
    graph.add_edge("calculate_math", "generate_response")
    graph.add_edge("generate_response", END)

    return graph.compile()


agent_graph = build_graph()


@observe(name="chat_pipeline")
def run_agent(state: AgentState, user_id: str) -> AgentState:
    """Invoke the graph as one Langfuse trace containing all 5 node spans."""
    langfuse_context.update_current_trace(user_id=user_id, input=state["query"])
    return agent_graph.invoke(state)


@observe(name="chat_pipeline_stream")
def stream_agent(state: AgentState, user_id: str):
    """Stream node updates as one Langfuse trace containing all 5 node spans."""
    langfuse_context.update_current_trace(user_id=user_id, input=state["query"])
    yield from agent_graph.stream(state, stream_mode="updates")
