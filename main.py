
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from sse_starlette.sse import EventSourceResponse

import asyncio
import ast
import operator as op
import json
import requests
import feedparser
from html import unescape
from urllib.parse import quote

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Math Components
ops = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
    ast.USub: op.neg, ast.FloorDiv: op.floordiv, ast.Mod: op.mod, ast.Pow: op.pow,
}
def _eval(node):
    if isinstance(node, ast.Num):  # py<3.8 compat
        return node.n
    if isinstance(node, ast.UnaryOp) and type(node.op) in ops:
        return ops[type(node.op)](_eval(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in ops:
        return ops[type(node.op)](_eval(node.left), _eval(node.right))
    raise ValueError("disallowed")

def eval_math(expr: str):
    try:
        # allow digits and common math symbols only
        if not all(c.isdigit() or c in "+-*/(). ^% " for c in expr):
            return None
        tree = ast.parse(expr.replace("^", "**"), mode="eval")
        return _eval(tree.body)
    except Exception:
        return None


# Science Dictionary- Wikipedia Summary
def wikipedia_summary(query: str) -> Optional[str]:
    slug = query.strip().replace(" ", "_")
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(slug)}"
    try:
        r = requests.get(
            url,
            headers={"User-Agent": "multi-llm-agent-demo/1.0"},
            timeout=6,
        )
        if r.status_code == 200:
            data = r.json()
            text = data.get("extract") or data.get("description")
            if text:
                if len(text) > 1200:
                    text = text[:1200].rsplit(" ", 1)[0] + " ..."
                return f"{text}\n\nSource: Wikipedia"
        return None
    except requests.RequestException:
        return None


# Random Facts 
def random_useless_fact() -> Optional[str]:
    try:
        r = requests.get(
            "https://uselessfacts.jsph.pl/random.json?language=en",
            headers={"User-Agent": "multi-llm-agent-demo/1.0"},
            timeout=6,
        )
        if r.status_code == 200:
            return (r.json().get("text") or "").strip()
    except requests.RequestException:
        pass
    return None

def numbers_trivia(n: str = "random") -> Optional[str]:
    try:
        r = requests.get(f"http://numbersapi.com/{n}?json", timeout=6)
        if r.status_code == 200:
            return (r.json().get("text") or "").strip()
    except requests.RequestException:
        pass
    return None


# News (Google News RSS via feedparser)
def fetch_news(query: str, limit: int = 3):
    url = f"https://news.google.com/rss/search?q={quote(query)}&hl=en-US&gl=US&ceid=US:en"
    feed = feedparser.parse(url)
    items = []
    for entry in (feed.entries or [])[:limit]:
        source_title = ""
        if getattr(entry, "source", None) and isinstance(entry.source, dict):
            source_title = entry.source.get("title", "")
        items.append({
            "title": unescape(entry.get("title", "")),
            "link": entry.get("link", ""),
            "published": entry.get("published", ""),
            "source": source_title,
        })
    return items


# Music (iTunes Search API) 
def itunes_top_tracks(artist: str, limit: int = 5):
    try:
        url = "https://itunes.apple.com/search"
        params = {"term": artist, "media": "music", "entity": "song", "limit": limit}
        r = requests.get(url, params=params, timeout=6)
        if r.status_code == 200:
            js = r.json()
            out = []
            for item in js.get("results", []):
                out.append({
                    "track": item.get("trackName"),
                    "artist": item.get("artistName"),
                    "album": item.get("collectionName"),
                    "preview": item.get("previewUrl"),
                    "store": item.get("trackViewUrl"),
                })
            return out
    except requests.RequestException:
        pass
    return []


# Tiny text helpers 
def first_sentence(text: str, max_len: int = 320) -> str:
    if not text:
        return ""
    s = text.strip().split(". ")
    candidate = s[0].strip()
    if len(candidate) > max_len:
        candidate = candidate[:max_len].rsplit(" ", 1)[0] + " ..."
    if not candidate.endswith((".", "!", "?")):
        candidate += "."
    return candidate


# Combine models fact for Random Facts model 
def context_fact(query: str, selected_models: List[str]) -> Optional[str]:
    """
    If Music (Model E) is selected, try to get a fact about the artist.
    Else if Science Dictionary (Model B) is selected, use Wikipedia on the query.
    Else fallback to generic random facts.
    """
    selected_lower = [m.strip().lower() for m in selected_models]

    # If Music selected, normalize artist and grab a sentence from Wikipedia
    if "model e" in selected_lower:
        tracks = itunes_top_tracks(query, limit=1)
        artist = (tracks[0]["artist"] if tracks else query).strip()
        summary = wikipedia_summary(artist)
        if summary:
            return f"{first_sentence(summary)}\n\nSource: Wikipedia"

    # If Science Dictionary selected, use Wikipedia on the query
    if "model b" in selected_lower:
        summary = wikipedia_summary(query)
        if summary:
            return f"{first_sentence(summary)}\n\nSource: Wikipedia"

    # Fallback: pure random
    return random_useless_fact() or numbers_trivia("random")


#  Models 
POOL = [
    {"name": "Model A", "specialty": "Math"},
    {"name": "Model B", "specialty": "Science Dictionary"},
    {"name": "Model C", "specialty": "Random Facts"},
    {"name": "Model D", "specialty": "News"},
    {"name": "Model E", "specialty": "Music"},
]


# Schemas
class RunAgentReq(BaseModel):
    query: str
    models: Optional[List[str]] = None

class FeedbackReq(BaseModel):
    model: str
    feedback: str


# Non-streaming 
@app.post("/api/run-agent")
def run_agent(body: RunAgentReq):
    chosen = [m.copy() for m in POOL if not body.models or m["name"] in body.models]
    selected = body.models or []

    for m in chosen:
        if m["name"] == "Model A":  # Math
            res = eval_math(body.query)
            m["initial_output"] = f"Parsed arithmetic expression: {body.query}"
            m["final_output"] = f"Computed result = {res}" if res is not None else "Could not compute a numeric result."

        elif m["name"] == "Model B":  # Science Dictionary
            summary = wikipedia_summary(body.query)
            m["initial_output"] = f"(Science) researched: {body.query}"
            m["final_output"] = summary or "No article found."

        elif m["name"] == "Model C":  # Random Facts (context-aware)
            fact = context_fact(body.query, selected)
            m["initial_output"] = "Fetched a topical fact." if fact else "Fetched a random fact."
            m["final_output"] = fact or "No fact available."

        elif m["name"] == "Model D":  # News
            arts = fetch_news(body.query, limit=3)
            if arts:
                lines = [f"- {a['title']} ({a['source']})\n  {a['link']}" for a in arts]
                m["initial_output"] = "Top headlines:\n" + "\n".join(lines)
                m["final_output"] = "Curated headlines:\n" + "\n".join(lines)
            else:
                m["initial_output"] = m["final_output"] = "No recent headlines found."

        elif m["name"] == "Model E":  # Music
            tracks = itunes_top_tracks(body.query, limit=5)
            if tracks:
                lines = [f"- {t['track']} — {t['artist']} ({t['album']})\n  {t['store']}" for t in tracks]
                m["initial_output"] = "Top tracks:\n" + "\n".join(lines)
                m["final_output"] = "Playlist suggestion:\n" + "\n".join(lines)
            else:
                m["initial_output"] = m["final_output"] = "No tracks found."

    synthesized = "Final combined answer: " + " ".join((m.get("final_output") or "")[:140] for m in chosen)
    return {"models": chosen, "synthesized_insight": synthesized}


# Streaming (SSE)
@app.get("/api/run-agent/stream")
async def run_agent_stream(query: str, models: Optional[str] = None):
    selected = [s.strip() for s in (models or "").split(",") if s.strip()] or [m["name"] for m in POOL]
    chosen = [m.copy() for m in POOL if m["name"] in selected]

    async def event_gen():
        # Step 1: assignment
        yield {"type": "timeline", "title": "Assigned tasks to selected models", "note": ", ".join(selected)}
        await asyncio.sleep(0.3)

        # Step 2: initial outputs (per model)
        for m in chosen:
            if m["name"] == "Model A":
                m["initial_output"] = f"Parsed arithmetic expression: {query}"

            elif m["name"] == "Model B":
                m["initial_output"] = wikipedia_summary(query) or "No concise entry found."

            elif m["name"] == "Model C":
                m["initial_output"] = context_fact(query, selected) or "No fact available."

            elif m["name"] == "Model D":
                arts = fetch_news(query, limit=3)
                m["initial_output"] = (
                    "No recent headlines found." if not arts else
                    "Top headlines:\n" + "\n".join([f"- {a['title']} ({a['source']})\n  {a['link']}" for a in arts])
                )

            elif m["name"] == "Model E":
                tracks = itunes_top_tracks(query, limit=5)
                m["initial_output"] = (
                    "No tracks found." if not tracks else
                    "Top tracks:\n" + "\n".join([f"- {t['track']} — {t['artist']} ({t['album']})\n  {t['store']}" for t in tracks])
                )

            yield {"type": "model_update", "model": m["name"], "field": "initial_output", "value": m["initial_output"]}
            await asyncio.sleep(0.2)

        yield {"type": "timeline", "title": "Cross-review & collaboration", "note": "Models read each other and refine"}
        await asyncio.sleep(0.5)

        # Step 3: final outputs (per model)
        for m in chosen:
            if m["name"] == "Model A":
                res = eval_math(query)
                m["final_output"] = f"Computed result = {res}" if res is not None else "Could not compute a numeric result."

            elif m["name"] == "Model B":
                txt = m.get("initial_output") or wikipedia_summary(query) or ""
                m["final_output"] = (txt + "\n\n(Checked for obvious contradictions.)").strip()

            elif m["name"] == "Model C":
                m["final_output"] = m.get("initial_output") or context_fact(query, selected) or "No fact available."

            elif m["name"] == "Model D":
                init = m.get("initial_output") or ""
                m["final_output"] = ("Curated headlines:\n" + init.replace("Top headlines:\n", "")).strip() if init else "No recent headlines found."

            elif m["name"] == "Model E":
                init = m.get("initial_output") or ""
                m["final_output"] = ("Playlist suggestion:\n" + init.replace("Top tracks:\n", "")).strip() if init else "No tracks found."

            yield {"type": "model_update", "model": m["name"], "field": "final_output", "value": m["final_output"]}
            await asyncio.sleep(0.2)

        yield {"type": "timeline", "title": "Synthesizer merged results", "note": "Conflicts resolved, caveats added"}
        synthesized = "Final combined answer: " + " ".join((m["final_output"] or "")[:140] for m in chosen)
        yield {"type": "final", "models": chosen, "synthesized_insight": synthesized}

    async def sse_iterator():
        async for ev in event_gen():
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return EventSourceResponse(sse_iterator())


#  Feedback
@app.post("/api/feedback")
def feedback(body: FeedbackReq):
    print("Feedback:", body.model, body.feedback)
    return {"status": "ok"}
