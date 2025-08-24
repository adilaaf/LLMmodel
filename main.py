# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import ast, operator as op

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Math (safe) ----------
OPS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
    ast.USub: op.neg, ast.UAdd: op.pos,
}
def _eval_ast(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)): return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in OPS: return OPS[type(node.op)](_eval_ast(node.left), _eval_ast(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in OPS: return OPS[type(node.op)](_eval_ast(node.operand))
    if isinstance(node, ast.Expr): return _eval_ast(node.value)
    raise ValueError("Unsupported")
def eval_math(expr: str):
    if not all(c.isdigit() or c in "+-*/.() " for c in expr): return None
    try: return _eval_ast(ast.parse(expr, mode="eval").body)
    except Exception: return None

# ---------- Science (tiny built-in QA) ----------
def science_qa(q: str):
    s = q.lower().strip()
    # very small demo dictionary; extend as you like
    if "speed of light" in s or "c in vacuum" in s:
        return ("≈ 299,792,458 m/s in vacuum.", "Constant c; independent of source speed in SR.")
    if ("boiling point" in s and "water" in s) or ("boil" in s and "water" in s):
        return ("≈ 100 °C (212 °F) at 1 atm.", "Varies with pressure/altitude.")
    if ("freezing point" in s and "water" in s) or ("freeze" in s and "water" in s):
        return ("≈ 0 °C (32 °F) at 1 atm.", "Impurities/pressure shift this.")
    if "photosynthesis" in s and ("equation" in s or "formula" in s):
        return ("6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂", "Overall balanced reaction in plants/algae/cyanobacteria.")
    if "gravity" in s and ("earth" in s or "gravitational acceleration" in s or "g =" in s):
        return ("≈ 9.81 m/s² at Earth's surface.", "Varies slightly by latitude/altitude.")
    if "pluto" in s and "planet" in s:
        return ("Pluto is a dwarf planet (IAU, 2006).", "Doesn’t clear its orbital neighborhood.")
    return None

class RunAgentReq(BaseModel):
    query: str
    models: Optional[List[str]] = None

class FeedbackReq(BaseModel):
    model: str
    feedback: str

@app.post("/api/run-agent")
def run_agent(body: RunAgentReq):
    pool = [
        {"name": "Model A", "specialty": "Math"},
        {"name": "Model B", "specialty": "Science"},
        {"name": "Model C", "specialty": "Reasoning"},
    ]
    chosen = [m for m in pool if not body.models or m["name"] in body.models]

    # Base per-model outputs
    models = [{
        **m,
        "initial_output": f'({m["specialty"]}) initial notes on: {body.query}',
        "final_output": f'({m["specialty"]}) refined after collaboration.'
    } for m in chosen]

    # Math
    math = eval_math(body.query)
    if math is not None:
        for m in models:
            if m["name"] == "Model A":
                m["initial_output"] = f"Parsed arithmetic expression: {body.query}"
                m["final_output"] = f"Computed result = {math}"

    # Science
    sci = science_qa(body.query)
    if sci is not None:
        ans, note = sci
        for m in models:
            if m["name"] == "Model B":
                m["initial_output"] = f"Identified topic & retrieved reference facts for: {body.query}"
                m["final_output"] = f"{ans} {note}"

    # Synthesizer combines what’s available
    pieces = []
    if math is not None: pieces.append(f"Math: {math}")
    if sci is not None: pieces.append(f"Science: {sci[0]}")
    synthesized = " · ".join(pieces) if pieces else f'Final combined answer for: "{body.query}".'

    return {"models": models, "synthesized_insight": synthesized}

@app.post("/api/feedback")
def feedback(body: FeedbackReq):
    print("Feedback:", body.model, body.feedback)
    return {"status": "ok"}
