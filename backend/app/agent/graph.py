"""LangGraph orchestration for the credit-card optimizer.

Every query is first classified into one of three routes, then flows through
a route-specific retrieval strategy, into a shared citation-building step,
into a single generation node whose prompt branches on the route:

    classify_and_extract
      /        |         \\
   purchase  general   off_topic
      |          |            \\
retrieve_rules retrieve_broad    \\
      |          |                 \\
   rerank        |                   \\
      |          |                     |
calculate_math   |                     |
      \\         /                      |
     build_citations                    |
           |                            |
      generate_response ----------------+
           |
          END

Only the classification and generation nodes are LLM calls (plus retrieval's
embedding call). The reward math itself stays deterministic Python; the
off-topic route makes no LLM call at all.
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

RETRIEVAL_LIMIT = 10  # dense candidates fetched before reranking (purchase path)
RETRIEVAL_LIMIT_GENERAL = 20  # broader recall for open-ended questions
RERANK_TOP_K = 3
RERANK_TOP_K_GENERAL = 6
MAX_HISTORY_TURNS = 6


class ChatTurn(TypedDict):
    role: str  # "user" | "assistant"
    content: str


class Citation(TypedDict):
    card_id: str
    card_name: str
    section: str
    snippet: str


class AgentState(TypedDict):
    query: str
    user_id: str
    owned_card_ids: list[str]
    owned_cards: list[dict]  # [{id, bank_name, card_name}] — for named-card resolution
    history: list[ChatTurn]  # prior turns, client-supplied, capped
    query_type: str  # "purchase" | "general" | "off_topic"
    named_card_hint: str
    extracted_merchant: str
    extracted_amount: float
    retrieved_rules: list[dict]
    calculated_yields: dict
    qualitative_offers: list[dict]
    citations: list[Citation]
    final_recommendation: str


# --------------------------------------------------------------------------
# Shared helpers
# --------------------------------------------------------------------------


def _history_as_messages(history: list[ChatTurn]) -> list[dict]:
    """Cap to the last N turns to bound prompt size."""
    return [{"role": h["role"], "content": h["content"]} for h in history[-MAX_HISTORY_TURNS:]]


def _recent_history_text(history: list[ChatTurn], turns: int = 2) -> str:
    return " ".join(h["content"] for h in history[-turns:])


def _match_card_ids_by_name(owned_cards: list[dict], named_card_hint: str) -> list[str]:
    """Case-insensitive substring match of a named-card hint against owned cards."""
    if not named_card_hint:
        return []
    needle = named_card_hint.lower()
    return [
        c["id"]
        for c in owned_cards
        if needle in f"{c['bank_name']} {c['card_name']}".strip().lower()
    ]


# --------------------------------------------------------------------------
# Nodes
# --------------------------------------------------------------------------

CLASSIFY_SYSTEM_PROMPT = """You classify and extract details from a user's question
about their own credit cards, given the recent conversation history.
Respond with ONLY a JSON object, no prose, in this exact shape:
{"query_type": "purchase" | "general" | "off_topic",
 "merchant": "<merchant or spend category, lowercase, '' if none>",
 "amount": <number, 0 if not stated>,
 "named_card": "<card name/bank the user explicitly named, '' if none>"}

- "purchase": user wants to know which of their cards to use for a specific
  purchase/merchant/amount (may be implied by history, e.g. "what about that
  Rs 3000 Amazon order").
- "general": any other question about the user's own cards — benefits, point
  structure, how to redeem, how to maximize rewards across cards, comparisons,
  follow-ups referencing a card by name without a purchase amount.
- "off_topic": unrelated to the user's credit cards or rewards (weather,
  general trivia, coding help, etc).

Use the conversation history to resolve pronouns/follow-ups (e.g. "what about
my Amazon Pay card?" after a prior turn about a Swiggy purchase)."""


@observe(name="classify_and_extract")
def node_classify_and_extract(state: AgentState) -> dict:
    """One LLM call: classify the query's type and extract purchase details."""
    raw = chat(
        system=CLASSIFY_SYSTEM_PROMPT,
        messages=_history_as_messages(state["history"]) + [{"role": "user", "content": state["query"]}],
    )

    query_type, merchant, amount, named_card = "general", "", 0.0, ""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group())
            query_type = parsed.get("query_type", "general")
            if query_type not in ("purchase", "general", "off_topic"):
                query_type = "general"
            merchant = str(parsed.get("merchant", "")).strip().lower()
            amount = float(parsed.get("amount") or 0)
            named_card = str(parsed.get("named_card", "")).strip()
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    # On parse failure, "general" (set above) is the safer default — it's the
    # more permissive path (broad retrieval, no forced math) rather than
    # force-fitting a parse failure through the rigid purchase-math route.

    return {
        "query_type": query_type,
        "extracted_merchant": merchant,
        "extracted_amount": amount,
        "named_card_hint": named_card,
    }


def _route_after_classify(state: AgentState) -> str:
    return state["query_type"]


@observe(name="retrieve_rules")
def node_retrieve_rules(state: AgentState) -> dict:
    """Dense retrieval from Qdrant for a purchase query, filtered to owned cards."""
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


@observe(name="retrieve_broad")
def node_retrieve_broad(state: AgentState) -> dict:
    """Broader retrieval for open-ended questions — no merchant/amount template.

    Embeds the raw conversational query plus recent history (there's no
    purchase to template a search around), searches across all owned cards
    unless the user named a specific one, and keeps more chunks than the
    purchase path since an answer may need to span multiple cards.
    """
    if not state["owned_card_ids"]:
        return {"retrieved_rules": []}

    search_text = f"{_recent_history_text(state['history'])} {state['query']}".strip()
    vector = embed_query(search_text)

    card_filter = owned_cards_filter(state["owned_card_ids"])
    if state["named_card_hint"]:
        matched_ids = _match_card_ids_by_name(state["owned_cards"], state["named_card_hint"])
        if matched_ids:
            card_filter = owned_cards_filter(matched_ids)

    hits = get_qdrant().query_points(
        collection_name=settings.qdrant_collection,
        query=vector,
        query_filter=card_filter,
        limit=RETRIEVAL_LIMIT_GENERAL,
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
    # Reuse the existing reranker (shared code + its graceful fallback to
    # dense order on failure) instead of a bespoke second selection strategy.
    top_chunks = rerank(state["query"], rules, top_k=RERANK_TOP_K_GENERAL)
    return {"retrieved_rules": top_chunks}


@observe(name="decline_off_topic")
def node_decline_off_topic(state: AgentState) -> dict:
    """Pure Python, no LLM call — guarantees on-scope behavior for off-topic queries."""
    return {
        "final_recommendation": (
            "I can only help with questions about your own credit cards and their "
            "rewards — which card to use, what a card's benefits are, or how to get "
            "more value from the cards you own. Try asking me something like that!"
        ),
        "citations": [],
        "calculated_yields": {},
        "qualitative_offers": [],
    }


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


@observe(name="build_citations")
def node_build_citations(state: AgentState) -> dict:
    """Path-agnostic citation list, built from whatever chunks were actually
    retrieved — runs immediately before generation so it always reflects the
    exact chunk set the LLM is given, regardless of which route was taken.
    """
    citations = [
        {
            "card_id": rule["card_id"],
            "card_name": f"{rule['bank_name']} {rule['card_name']}".strip(),
            "section": rule.get("section", ""),
            "snippet": rule["text"][:300],
        }
        for rule in state["retrieved_rules"]
    ]
    return {"citations": citations}


GENERATION_SYSTEM_PROMPT_PURCHASE = """You are a credit-card rewards advisor. Using ONLY the
pre-calculated yields, qualitative offers, and citations provided, recommend which
owned card the user should use for this purchase.

- If `calculated_yields` has entries, state the winning card, the expected reward, and
  a short justification quoting the relevant rule.
- If `calculated_yields` is empty but `qualitative_offers` has entries, describe the
  relevant offer(s) (e.g. flat discounts, Buy-One-Get-One deals, milestone benefits)
  straight from the rule text — these are real benefits that just don't reduce to a
  clean percentage rate, do not invent a rate or numeric reward for them.
- Only say you could not find an applicable reward rule if BOTH are empty.
- Cite your claims using the section names present in `citations`.
- Never invent numbers that are not present in the data."""

GENERATION_SYSTEM_PROMPT_GENERAL = """You are a credit-card rewards advisor answering a
general question about the user's own credit cards (benefits, point structure,
redemption, or how to maximize rewards across cards they own). Using ONLY the rule
excerpts in `citations` and the conversation history for context, answer the user's
question directly and conversationally.

- If asked to compare or maximize across cards, synthesize across all provided
  citations rather than picking one "winner".
- Cite your claims using the section names present in `citations`.
- Do not invent numbers, rates, or benefits not present in the citations.
- If the citations do not cover the question, say so plainly rather than guessing."""


@observe(name="generate_response")
def node_generate_response(state: AgentState) -> dict:
    """Call Qwen3 to turn the retrieved/computed data into a human-readable answer.

    The system prompt branches on query_type: the purchase path keeps the
    original winner-recommendation framing, the general path is instructed to
    synthesize across all citations instead of picking a single winner.
    """
    system = (
        GENERATION_SYSTEM_PROMPT_PURCHASE
        if state["query_type"] == "purchase"
        else GENERATION_SYSTEM_PROMPT_GENERAL
    )
    context = json.dumps(
        {
            "query": state["query"],
            "query_type": state["query_type"],
            "merchant": state["extracted_merchant"],
            "amount": state["extracted_amount"],
            "calculated_yields": state["calculated_yields"],
            "qualitative_offers": state.get("qualitative_offers", []),
            "citations": state["citations"],
        },
        indent=2,
    )
    answer = chat(
        system=system,
        messages=_history_as_messages(state["history"]) + [{"role": "user", "content": context}],
        temperature=0.3,
    )
    return {"final_recommendation": answer}


# --------------------------------------------------------------------------
# Graph assembly
# --------------------------------------------------------------------------

def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("classify_and_extract", node_classify_and_extract)
    graph.add_node("retrieve_rules", node_retrieve_rules)
    graph.add_node("rerank", node_rerank)
    graph.add_node("calculate_math", node_calculate_math)
    graph.add_node("retrieve_broad", node_retrieve_broad)
    graph.add_node("build_citations", node_build_citations)
    graph.add_node("generate_response", node_generate_response)
    graph.add_node("decline_off_topic", node_decline_off_topic)

    graph.add_edge(START, "classify_and_extract")
    graph.add_conditional_edges(
        "classify_and_extract",
        _route_after_classify,
        {"purchase": "retrieve_rules", "general": "retrieve_broad", "off_topic": "decline_off_topic"},
    )
    graph.add_edge("retrieve_rules", "rerank")
    graph.add_edge("rerank", "calculate_math")
    graph.add_edge("calculate_math", "build_citations")
    graph.add_edge("retrieve_broad", "build_citations")
    graph.add_edge("build_citations", "generate_response")
    graph.add_edge("generate_response", END)
    graph.add_edge("decline_off_topic", END)

    return graph.compile()


agent_graph = build_graph()


@observe(name="chat_pipeline")
def run_agent(state: AgentState, user_id: str) -> AgentState:
    """Invoke the graph as one Langfuse trace containing all node spans."""
    langfuse_context.update_current_trace(user_id=user_id, input=state["query"])
    return agent_graph.invoke(state)


@observe(name="chat_pipeline_stream")
def stream_agent(state: AgentState, user_id: str):
    """Stream node updates as one Langfuse trace containing all node spans."""
    langfuse_context.update_current_trace(user_id=user_id, input=state["query"])
    yield from agent_graph.stream(state, stream_mode="updates")
